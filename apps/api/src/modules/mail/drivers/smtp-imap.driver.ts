import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
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
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.text,
      html: input.html,
      inReplyTo: input.inReplyTo,
      references: input.references,
      attachments: input.attachments,
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
    return {
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
