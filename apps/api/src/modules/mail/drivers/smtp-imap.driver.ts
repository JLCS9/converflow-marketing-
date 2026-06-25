import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { DriverConfig, MailDriver, MailSendInput, ParsedMessageSummary } from './mail-driver.js';

/**
 * SMTP (send) + IMAP (receive) driver. Works with any standard mailbox,
 * including Gmail/Workspace via an App Password. Credentials arrive decrypted
 * in the DriverConfig.
 */
export class SmtpImapDriver implements MailDriver {
  constructor(private readonly cfg: DriverConfig) {}

  private transporter() {
    return nodemailer.createTransport({
      host: this.cfg.smtpHost ?? undefined,
      port: this.cfg.smtpPort ?? 465,
      secure: this.cfg.secure ?? true,
      auth: { user: this.cfg.username ?? this.cfg.fromAddress, pass: this.cfg.secret ?? '' },
    });
  }

  private imap() {
    return new ImapFlow({
      host: this.cfg.imapHost ?? '',
      port: this.cfg.imapPort ?? 993,
      secure: this.cfg.secure ?? true,
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

  async send(input: MailSendInput): Promise<{ id?: string }> {
    const info = await this.transporter().sendMail({
      from: this.cfg.displayName
        ? { name: this.cfg.displayName, address: this.cfg.fromAddress }
        : this.cfg.fromAddress,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      inReplyTo: input.inReplyTo,
      references: input.references,
    });
    return { id: info.messageId };
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
}
