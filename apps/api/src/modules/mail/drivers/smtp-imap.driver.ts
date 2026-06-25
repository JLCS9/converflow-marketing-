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

  async fetchSince(cursor: number | null): Promise<{ messages: ParsedEmail[]; cursor: number }> {
    const client = this.imap();
    await client.connect();
    const messages: ParsedEmail[] = [];
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const mbox = client.mailbox;
        const uidNext = mbox && typeof mbox !== 'boolean' ? mbox.uidNext : 1;
        // First sync: don't import history — just set the cursor at the tip.
        if (cursor == null || cursor <= 0) {
          return { messages, cursor: Math.max(0, (uidNext ?? 1) - 1) };
        }
        let maxUid = cursor;
        for await (const msg of client.fetch(
          { uid: `${cursor + 1}:*` },
          { source: true, uid: true },
        )) {
          if (msg.uid && msg.uid > maxUid) maxUid = msg.uid;
          if (!msg.source) continue;
          const p = await simpleParser(msg.source);
          const sender = p.from?.value?.[0];
          const refs = Array.isArray(p.references) ? p.references.join(' ') : (p.references ?? undefined);
          messages.push({
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
          });
        }
        return { messages, cursor: maxUid };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
}
