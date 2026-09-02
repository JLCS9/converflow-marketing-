import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { resolveSecure, pickSentMailbox, providerAutoSavesSent } from './mail-driver.js';
import type {
  DriverConfig,
  MailDriver,
  MailSendInput,
  ParsedEmail,
  ParsedMessageSummary,
} from './mail-driver.js';

const addrs = (v: { value?: { address?: string }[] } | undefined): string[] =>
  (v?.value ?? []).map((a) => a.address ?? '').filter(Boolean);

/**
 * SMTP (send) + IMAP (receive) driver. Works with any standard mailbox,
 * including Gmail/Workspace via an App Password. Credentials arrive decrypted
 * in the DriverConfig.
 */
export class SmtpImapDriver implements MailDriver {
  constructor(private readonly cfg: DriverConfig) {}

  private transporter() {
    const secure = resolveSecure(this.cfg.smtpSecure, this.cfg.smtpPort, this.cfg.secure);
    return nodemailer.createTransport({
      host: this.cfg.smtpHost ?? undefined,
      port: this.cfg.smtpPort ?? 465,
      secure,
      // On a non-implicit-TLS port, demand STARTTLS instead of accepting it as
      // optional — otherwise a server that omits the capability gets the
      // mailbox password in cleartext.
      requireTLS: !secure,
      auth: { user: this.cfg.username ?? this.cfg.fromAddress, pass: this.cfg.secret ?? '' },
    });
  }

  private imap() {
    return new ImapFlow({
      host: this.cfg.imapHost ?? '',
      port: this.cfg.imapPort ?? 993,
      secure: resolveSecure(this.cfg.imapSecure, this.cfg.imapPort, this.cfg.secure),
      auth: { user: this.cfg.username ?? this.cfg.fromAddress, pass: this.cfg.secret ?? '' },
      logger: false,
    });
  }

  async verify(): Promise<void> {
    // SMTP first (cheap), then IMAP login.
    await this.transporter().verify();
    const client = this.imap();
    await client.connect();
    try {
      await client.noop();
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  /** Shared message envelope, so the sent copy is byte-identical to what we send. */
  private mailOptions(input: MailSendInput, messageId: string) {
    return {
      messageId,
      from: this.cfg.displayName
        ? { name: this.cfg.displayName, address: this.cfg.fromAddress }
        : this.cfg.fromAddress,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.text,
      html: input.html,
      inReplyTo: input.inReplyTo,
      references: input.references,
      attachments: input.attachments,
    };
  }

  async send(input: MailSendInput): Promise<{ id?: string }> {
    // Stamp the Message-ID ourselves instead of letting nodemailer invent one
    // per build: the copy we file in Sent must carry the same id as the message
    // that actually went out, or the user's mail client shows two threads.
    const domain = this.cfg.fromAddress.split('@')[1] ?? 'converflow.ai';
    const messageId = input.messageId ?? `<${randomUUID()}@${domain}>`;
    const options = this.mailOptions(input, messageId);

    const info = await this.transporter().sendMail(options);

    // File a copy in the mailbox's own Sent folder. Without this, nothing sent
    // from Converflow ever appears in the customer's Gmail/Outlook. Deliberately
    // NOT awaited: it is a second IMAP round-trip and must never delay or fail
    // the send that already succeeded.
    void this.appendToSent(options).catch(() => undefined);

    return { id: info.messageId ?? messageId };
  }

  /**
   * Build the same message again as raw MIME and APPEND it to the Sent mailbox.
   * Skipped for providers that already do it (Gmail), which would otherwise
   * show every sent message twice.
   */
  private async appendToSent(options: ReturnType<SmtpImapDriver['mailOptions']>): Promise<void> {
    if (providerAutoSavesSent(this.cfg.smtpHost)) return;
    if (!this.cfg.imapHost) return;

    // streamTransport+buffer composes the MIME without sending anything.
    const built = await nodemailer
      .createTransport({ streamTransport: true, buffer: true })
      .sendMail(options);
    const raw = built.message as Buffer | undefined;
    if (!raw?.length) return;

    const client = this.imap();
    await client.connect();
    try {
      const boxes = await client.list();
      const sent = pickSentMailbox(boxes);
      if (!sent) return; // no Sent folder we recognise — nothing to do
      await client.append(sent, raw, ['\\Seen']);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  async fetchRecent(limit: number): Promise<ParsedMessageSummary[]> {
    const client = this.imap();
    await client.connect();
    const out: ParsedMessageSummary[] = [];
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const mbox = client.mailbox;
        const total = mbox && typeof mbox !== 'boolean' ? mbox.exists : 0;
        if (!total) return out;
        const from = Math.max(1, total - limit + 1);
        for await (const msg of client.fetch(`${from}:*`, { source: true })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const sender = parsed.from?.value?.[0];
          out.push({
            messageId: parsed.messageId ?? undefined,
            from: sender?.address ?? undefined,
            fromName: sender?.name || undefined,
            subject: parsed.subject ?? undefined,
            date: parsed.date ?? undefined,
            snippet: (parsed.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    // newest first
    return out.reverse();
  }

  // First connect imports a bounded slice of recent mail (not the whole mailbox,
  // to avoid flooding) so the inbox isn't empty right after connecting.
  private static readonly FIRST_IMPORT = 25;

  async fetchSince(cursor: number | null): Promise<{ messages: ParsedEmail[]; cursor: number }> {
    const client = this.imap();
    await client.connect();
    const messages: ParsedEmail[] = [];
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const mbox = client.mailbox;
        const tip = (mbox && typeof mbox !== 'boolean' ? mbox.uidNext : 1) - 1;
        if (tip <= 0) return { messages, cursor: 0 };

        const firstSync = cursor == null || cursor <= 0;
        const from = firstSync ? Math.max(1, tip - SmtpImapDriver.FIRST_IMPORT + 1) : cursor + 1;
        if (!firstSync && from > tip) return { messages, cursor: tip }; // nothing new

        let maxUid = firstSync ? tip : cursor;
        for await (const msg of client.fetch({ uid: `${from}:${tip}` }, { source: true, uid: true })) {
          if (msg.uid && msg.uid > maxUid) maxUid = msg.uid;
          if (!msg.source) continue;
          messages.push(await this.parseToEmail(msg.source));
        }
        return { messages, cursor: maxUid };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  private async parseToEmail(source: Buffer): Promise<ParsedEmail> {
    const p = await simpleParser(source);
    const sender = p.from?.value?.[0];
    const refs = Array.isArray(p.references) ? p.references.join(' ') : (p.references ?? undefined);
    const replyTo = p.replyTo?.value?.[0]?.address ?? undefined;
    // RFC 3834 + señales de lista/robot: la atención autónoma no debe
    // responder a auto-replies (OOO, bounces, notificaciones).
    const autoSubmittedHdr = String(p.headers.get('auto-submitted') ?? '').toLowerCase();
    const precedence = String(p.headers.get('precedence') ?? '').toLowerCase();
    const autoSubmitted =
      (autoSubmittedHdr !== '' && autoSubmittedHdr !== 'no') ||
      ['bulk', 'auto_reply', 'junk', 'list'].includes(precedence) ||
      p.headers.has('x-autoreply') ||
      p.headers.has('x-autorespond') ||
      p.headers.has('list-id');
    return {
      replyTo,
      autoSubmitted,
      rfcMessageId: p.messageId ?? undefined,
      inReplyTo: p.inReplyTo ?? undefined,
      references: refs,
      fromAddress: sender?.address ?? undefined,
      fromName: sender?.name || undefined,
      to: addrs(p.to as never),
      cc: addrs(p.cc as never),
      subject: p.subject ?? undefined,
      html: typeof p.html === 'string' ? p.html : undefined,
      text: p.text ?? undefined,
      snippet: (p.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      date: p.date ?? undefined,
      hasAttachments: (p.attachments?.length ?? 0) > 0,
      attachments: (p.attachments ?? []).map((a) => ({
        filename: a.filename ?? undefined,
        mimeType: a.contentType ?? undefined,
        content: a.content as Buffer,
        inline: a.contentDisposition === 'inline',
        contentId: a.contentId ?? undefined,
      })),
    };
  }
}
