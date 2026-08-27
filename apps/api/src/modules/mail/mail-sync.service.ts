import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { decryptSecret } from '../../common/utils/crypto.js';
import { createMailDriver } from './drivers/index.js';
import { MailIngestService } from './mail-ingest.service.js';

/** Statuses the scheduler will still try. ERROR needs a human first. */
const SYNCABLE = ['CONNECTED', 'DEGRADED'] as const;

/** Backoff per consecutive failure, in minutes. Last value repeats. */
const BACKOFF_MINUTES = [1, 2, 5, 10, 20, 30];

/** After this many consecutive failures, stop retrying and ask for a human. */
const MAX_FAILURES = 8;

/**
 * Errors that will never fix themselves: wrong password, revoked app password,
 * mailbox disabled. Retrying these just locks the account harder, so they
 * escalate to ERROR on the first occurrence.
 */
const PERMANENT_ERROR_RE =
  /(auth|authenticat|credential|password|login\s*fail|invalid\s*user|account\s*disabled|535|534|5\.7\.\d)/i;

export function isPermanent(message: string): boolean {
  return PERMANENT_ERROR_RE.test(message);
}

export function backoffMs(failures: number): number {
  const idx = Math.min(Math.max(failures, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[idx]! * 60_000;
}

/**
 * Receive pipeline: per syncable smtp_imap connection, fetch new INBOX mail by
 * UID cursor and hand each message to the ingest/threading service. Polls every
 * ~90s (single cfai-api instance). Cross-tenant scan via bypass; each sync runs
 * scoped to its tenant. Driver fetch + ingest run OUTSIDE request context.
 *
 * Failure handling: a transient error (network, provider hiccup) moves the
 * connection to DEGRADED with exponential backoff and it KEEPS being synced.
 * Only an auth-shaped error, or MAX_FAILURES in a row, escalates to ERROR —
 * which stops automatic syncing and emails the owner once. Before this, any
 * single blip set status=ERROR while the scheduler only ever selected
 * CONNECTED, so the mailbox died silently and permanently.
 */
@Injectable()
export class MailSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: MailIngestService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 90_000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const conns = await this.prisma.bypass((tx) =>
        tx.mailConnection.findMany({
          where: {
            driver: 'SMTP_IMAP',
            status: { in: [...SYNCABLE] },
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
          select: { id: true, tenantId: true },
          // Oldest sync first so the `take` cap round-robins instead of
          // starving whatever sorts last.
          orderBy: { lastSyncedAt: 'asc' },
          take: 100,
        }),
      );
      for (const c of conns) {
        await this.syncConnection(c.tenantId, c.id).catch((err) =>
          this.logger.warn({ err, id: c.id }, 'mail sync failed'),
        );
      }
    } catch (err) {
      this.logger.warn({ err }, 'mail sync tick failed');
    } finally {
      this.running = false;
    }
  }

  /** Fetch + ingest new messages for one connection; advance the UID cursor. */
  async syncConnection(tenantId: string, connectionId: string) {
    const conn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.findUnique({ where: { id: connectionId } }),
    );
    if (!conn || conn.driver !== 'SMTP_IMAP') return { ingested: 0 };

    const driver = createMailDriver({
      driver: conn.driver,
      fromAddress: conn.fromAddress,
      displayName: conn.displayName,
      imapHost: conn.imapHost,
      imapPort: conn.imapPort,
      smtpHost: conn.smtpHost,
      smtpPort: conn.smtpPort,
      username: conn.username,
      secret: conn.secretEnc ? decryptSecret(conn.secretEnc) : null,
      smtpSecure: conn.smtpSecure,
      imapSecure: conn.imapSecure,
      secure: conn.secure,
    });

    try {
      const { messages, cursor } = await driver.fetchSince(conn.syncCursor);
      for (const m of messages) {
        // Isolate per-message: one bad message (e.g. duplicate Message-ID in the
        // same batch) must not abort the rest or block the cursor — otherwise the
        // mailbox gets stuck and stops receiving any further replies.
        await this.ingest.ingest(tenantId, connectionId, m).catch((err) =>
          this.logger.warn({ err, id: connectionId, mid: m.rfcMessageId }, 'mail ingest skipped one message'),
        );
      }
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.mailConnection.update({
          where: { id: connectionId },
          data: {
            syncCursor: cursor,
            lastSyncedAt: new Date(),
            status: 'CONNECTED',
            lastError: null,
            consecutiveFailures: 0,
            nextRetryAt: null,
            errorNotifiedAt: null,
          },
        }),
      );
      return { ingested: messages.length };
    } catch (err) {
      await this.recordFailure(tenantId, connectionId, err).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Mark one failed sync: DEGRADED + backoff, or ERROR when the error is
   * permanent or we've retried too many times.
   */
  private async recordFailure(tenantId: string, connectionId: string, err: unknown) {
    const message = String((err as Error)?.message ?? err).slice(0, 300);
    const current = await this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.findUnique({
        where: { id: connectionId },
        select: { consecutiveFailures: true, errorNotifiedAt: true, fromAddress: true, visibility: true, ownerUserId: true },
      }),
    );
    const failures = (current?.consecutiveFailures ?? 0) + 1;
    const giveUp = isPermanent(message) || failures >= MAX_FAILURES;

    await this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.update({
        where: { id: connectionId },
        data: {
          status: giveUp ? 'ERROR' : 'DEGRADED',
          lastError: message,
          consecutiveFailures: failures,
          // ERROR is not retried automatically, so the timestamp is only
          // meaningful while DEGRADED.
          nextRetryAt: giveUp ? null : new Date(Date.now() + backoffMs(failures)),
        },
      }),
    );

    if (giveUp) {
      this.logger.warn(
        { id: connectionId, failures, message },
        'mail connection escalated to ERROR — needs a human',
      );
      // Notify once per outage, and never let a mail failure fail the sync.
      if (!current?.errorNotifiedAt) {
        await this.notifyOwner(tenantId, connectionId, current?.fromAddress ?? '', message).catch(
          (e) => this.logger.warn({ err: e, id: connectionId }, 'could not notify mailbox owner'),
        );
      }
    } else {
      this.logger.warn({ id: connectionId, failures }, 'mail sync degraded — will retry with backoff');
    }
  }

  /**
   * Email whoever is responsible for the mailbox: its owner for PRIVATE boxes,
   * the tenant OWNER for SHARED ones. Sent via the system path — the tenant's
   * own mailbox is precisely what is broken.
   */
  private async notifyOwner(
    tenantId: string,
    connectionId: string,
    fromAddress: string,
    reason: string,
  ) {
    const recipient = await this.prisma.withTenant(tenantId, async (tx) => {
      const conn = await tx.mailConnection.findUnique({
        where: { id: connectionId },
        select: { visibility: true, ownerUserId: true },
      });
      if (conn?.visibility === 'PRIVATE' && conn.ownerUserId) {
        return tx.user.findUnique({ where: { id: conn.ownerUserId }, select: { email: true, name: true } });
      }
      return tx.user.findFirst({
        where: { role: 'OWNER', status: 'ACTIVE' },
        select: { email: true, name: true },
        orderBy: { createdAt: 'asc' },
      });
    });
    if (!recipient?.email) return;

    await this.email.notifyUser(tenantId, {
      toEmail: recipient.email,
      subject: `⚠️ Converflow ha dejado de sincronizar ${fromAddress}`,
      text:
        `Hola${recipient.name ? ` ${recipient.name}` : ''},\n\n` +
        `El buzón ${fromAddress} ha fallado varias veces seguidas y hemos pausado su sincronización, ` +
        `así que los correos nuevos NO están entrando en Converflow.\n\n` +
        `Motivo técnico: ${reason}\n\n` +
        `Lo más habitual es que la contraseña de aplicación haya caducado o se haya revocado. ` +
        `Entra en Correo → Ajustes → Buzones, edita la conexión y pulsa "Probar sincronización" ` +
        `para reactivarla.\n`,
    });

    await this.prisma
      .withTenant(tenantId, (tx) =>
        tx.mailConnection.update({ where: { id: connectionId }, data: { errorNotifiedAt: new Date() } }),
      )
      .catch(() => undefined);
  }
}
