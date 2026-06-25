/**
 * Driver abstraction for mailbox transports. The rest of the mail module talks
 * only to this interface — it never knows whether the mailbox is SMTP/IMAP,
 * Gmail OAuth, Microsoft Graph or a provider API. Fase 1 implements smtp_imap.
 */

export interface MailSendInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}

/** A parsed inbound message summary (Fase 1 test-sync; full ingest is Fase 2). */
export interface ParsedMessageSummary {
  messageId?: string;
  from?: string;
  fromName?: string;
  subject?: string;
  date?: Date;
  snippet?: string;
}

export interface MailDriver {
  /** Verify connectivity/credentials. Throws on failure. */
  verify(): Promise<void>;
  /** Send a message; returns the provider/native message id. */
  send(input: MailSendInput): Promise<{ id?: string }>;
  /** Fetch the most recent INBOX messages (parsed summaries). */
  fetchRecent(limit: number): Promise<ParsedMessageSummary[]>;
}

/** Decrypted connection config a driver needs (secret already plaintext). */
export interface DriverConfig {
  driver: string;
  fromAddress: string;
  displayName?: string | null;
  imapHost?: string | null;
  imapPort?: number | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  username?: string | null;
  secret?: string | null; // decrypted password / token
  secure?: boolean;
}
