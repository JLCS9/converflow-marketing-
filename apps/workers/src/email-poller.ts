/**
 * Email inbound poller. For each connected mailbox (EmailConnection), polls the
 * INBOX over IMAP for new messages and forwards them to the API's internal
 * email webhook (which upserts the conversation + runs the agent).
 *
 * First poll of a mailbox only sets the UID cursor (we don't import history).
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma, withRlsBypass } from '@converflow/db';
import pino from 'pino';
import { decryptSecret } from './crypto';

const logger = pino({ name: 'email-poller', level: process.env.LOG_LEVEL ?? 'info' });
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://api:4000';
const internalToken = process.env.BOT_RUNNER_INTERNAL_TOKEN ?? '';
const POLL_INTERVAL_MS = Number(process.env.EMAIL_POLL_INTERVAL_MS ?? 60_000);

interface Conn {
  botId: string;
  email: string;
  imapHost: string;
  imapPort: number;
  username: string;
  passwordEnc: string;
  secure: boolean;
  lastSeenUid: number | null;
}

// Senders that are never real customers — bounces, daemons, no-reply boxes.
const AUTOMATED_SENDER = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce|bounces|notifications?|mailer|abuse)[@+]/i;
function isAutomatedSender(address: string): boolean {
  return AUTOMATED_SENDER.test(address.trim());
}

async function forwardInbound(payload: {
  to: string;
  from: string;
  fromName?: string;
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
}): Promise<void> {
  const res = await fetch(`${API_INTERNAL_URL}/internal/email/inbound`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-token': internalToken },
    body: JSON.stringify(payload),
  });
  if (!res.ok) logger.warn({ status: res.status }, 'email inbound webhook non-2xx');
}

async function setCursor(botId: string, uid: number): Promise<void> {
  await withRlsBypass(prisma, (tx) =>
    tx.emailConnection.update({
      where: { botId },
      // Clear the error too: nothing used to reset this, so one transient
      // network blip left `status = ERROR` forever while the mailbox kept
      // working perfectly. The field was reporting "failed once, ever".
      data: { lastSeenUid: uid, status: 'CONNECTED', lastError: null },
    }),
  );
}

async function markError(botId: string, message: string): Promise<void> {
  await withRlsBypass(prisma, (tx) =>
    tx.emailConnection.update({
      where: { botId },
      data: { status: 'ERROR', lastError: message.slice(0, 300) },
    }),
  ).catch(() => {});
}

async function pollConnection(conn: Conn): Promise<void> {
  const client = new ImapFlow({
    host: conn.imapHost,
    port: conn.imapPort,
    secure: conn.secure,
    auth: { user: conn.username, pass: decryptSecret(conn.passwordEnc) },
    logger: false,
    emitLogs: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const mailbox = client.mailbox;
      const uidNext = typeof mailbox === 'object' && mailbox ? (mailbox.uidNext ?? 1) : 1;

      // First sync: just record where we are; don't import the whole inbox.
      if (conn.lastSeenUid == null) {
        await setCursor(conn.botId, Math.max(0, uidNext - 1));
        return;
      }

      let maxUid = conn.lastSeenUid;
      for await (const msg of client.fetch(
        `${conn.lastSeenUid + 1}:*`,
        { uid: true, source: true },
        { uid: true },
      )) {
        const uid = msg.uid ?? 0;
        if (uid <= conn.lastSeenUid) continue;
        maxUid = Math.max(maxUid, uid);
        if (!msg.source) continue;
        try {
          const parsed = await simpleParser(msg.source);
          const sender = parsed.from?.value?.[0];
          const from = sender?.address ?? '';
          if (!from) continue;

          // Anti-loop guard: never ingest bounces / auto-replies / system mail,
          // nor our own address. Otherwise an undeliverable campaign (or an
          // out-of-office) bounces into this INBOX → agent replies → bounces →
          // infinite loop. Headers are only available here (mailparser), so we
          // gate at the poller. The cursor still advances (we don't re-fetch).
          const autoSubmitted = String(parsed.headers.get('auto-submitted') ?? '').toLowerCase();
          const precedence = String(parsed.headers.get('precedence') ?? '').toLowerCase();
          if (
            (autoSubmitted && autoSubmitted !== 'no') ||
            ['bulk', 'auto_reply', 'list', 'junk'].includes(precedence) ||
            isAutomatedSender(from) ||
            from.toLowerCase() === conn.email.toLowerCase()
          ) {
            logger.info({ from }, 'skipping automated/bounce email (anti-loop)');
            continue;
          }

          await forwardInbound({
            to: conn.email,
            from,
            fromName: sender?.name || undefined,
            subject: parsed.subject ?? '',
            text: parsed.text ?? '',
            html: typeof parsed.html === 'string' ? parsed.html : undefined,
            messageId: parsed.messageId ?? undefined,
          });
        } catch (err) {
          logger.warn({ err, uid }, 'failed to parse/forward email');
        }
      }

      if (maxUid > conn.lastSeenUid) await setCursor(conn.botId, maxUid);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Legacy connections this poller must leave alone.
 *
 * Two reasons, both seen in production:
 *
 *  1. SUPERSEDED — the same address is already connected in the mail module
 *     (`MailConnection`), which polls it too. Two pollers on one mailbox means
 *     the same email ingested twice: once as a Conversation/Message and once as
 *     an EmailThread/EmailMessage.
 * NOTE: we deliberately do NOT skip connections whose status is ERROR. In this
 * legacy model that flag was never reset on success, so it means "a poll failed
 * at some point", not "this mailbox is broken". Both ERROR rows in production
 * turned out to be transient network errors ("Failed to establish connection in
 * required time", "Unexpected close") on mailboxes that were still delivering
 * mail. Skipping them would have silently switched off a customer's only inbox.
 */
async function loadPollable(): Promise<Conn[]> {
  const rows = await withRlsBypass(prisma, (tx) =>
    tx.emailConnection.findMany({
      select: {
        botId: true,
        tenantId: true,
        email: true,
        imapHost: true,
        imapPort: true,
        username: true,
        passwordEnc: true,
        secure: true,
        lastSeenUid: true,
      },
    }),
  );
  if (!rows.length) return [];

  const migrated = await withRlsBypass(prisma, (tx) =>
    tx.mailConnection.findMany({ select: { tenantId: true, fromAddress: true } }),
  );
  const superseded = new Set(migrated.map((m) => mailboxKey(m.tenantId, m.fromAddress)));

  const out: Conn[] = [];
  for (const r of rows) {
    if (pollVerdict(r, superseded) === 'superseded') {
      logger.info({ email: r.email }, 'skipping legacy connection: already in the mail module');
      continue;
    }
    out.push(r as unknown as Conn);
  }
  return out;
}

/** Key used to match a legacy connection against the mail module's mailboxes. */
export function mailboxKey(tenantId: string, email: string): string {
  return `${tenantId}:${email.trim().toLowerCase()}`;
}

/**
 * Pure decision, extracted so it can be tested without a database.
 *
 * Only "already migrated" stops a poll. Status is NOT consulted on purpose —
 * see the note on `loadPollable`.
 */
export function pollVerdict(
  row: { tenantId: string; email: string },
  superseded: Set<string>,
): 'poll' | 'superseded' {
  return superseded.has(mailboxKey(row.tenantId, row.email)) ? 'superseded' : 'poll';
}

async function tick(): Promise<void> {
  const conns = await loadPollable();

  for (const conn of conns) {
    try {
      await pollConnection(conn);
    } catch (err) {
      logger.warn({ err, email: conn.email }, 'email poll failed');
      await markError(conn.botId, err instanceof Error ? err.message : 'poll failed');
    }
  }
}

export function startEmailPoller(): void {
  logger.info({ intervalMs: POLL_INTERVAL_MS }, 'email poller started');
  const run = () => {
    void tick().catch((err) => logger.error({ err }, 'email poller tick error'));
  };
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
