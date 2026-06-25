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

/** A fully parsed inbound email for ingestion (Fase 2.1). */
export interface ParsedEmail {
  rfcMessageId?: string;
  inReplyTo?: string;
  references?: string; // space-separated
  fromAddress?: string;
  fromName?: string;
  to: string[];
  cc: string[];
  subject?: string;
  html?: string;
  text?: string;
  snippet?: string;
  date?: Date;
  hasAttachments: boolean;
}

export interface MailDriver {
  /** Verify connectivity/credentials. Throws on failure. */
  verify(): Promise<void>;
  /** Send a message; returns the provider/native message id. */
  send(input: MailSendInput): Promise<{ id?: string }>;
  /** Fetch the most recent INBOX messages (parsed summaries). */
  fetchRecent(limit: number): Promise<ParsedMessageSummary[]>;
  /**
   * Incremental INBOX fetch by UID cursor. First sync (cursor null/0) MUST NOT
   * import history: it sets the cursor to the current uidNext-1 and returns no
   * messages. Subsequent calls return messages with UID > cursor.
   */
  fetchSince(cursor: number | null): Promise<{ messages: ParsedEmail[]; cursor: number }>;
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
