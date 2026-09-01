/**
 * Driver abstraction for mailbox transports. The rest of the mail module talks
 * only to this interface — it never knows whether the mailbox is SMTP/IMAP,
 * Gmail OAuth, Microsoft Graph or a provider API. Fase 1 implements smtp_imap.
 */

export interface MailSendInput {
  to: string | string[];
  /**
   * RFC Message-ID to stamp on the message. Provide one so the copy appended to
   * the mailbox's Sent folder carries the SAME id as the message that went out
   * (otherwise the user's mail client sees two unrelated messages).
   */
  messageId?: string;
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  /** Files to attach. `path` is a URL (presigned R2) nodemailer fetches. */
  attachments?: { filename: string; path: string }[];
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
  /** Cabecera Reply-To: si el remitente la puso, responder va ahí, no al From. */
  replyTo?: string;
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
  attachments?: {
    filename?: string;
    mimeType?: string;
    content?: Buffer;
    inline?: boolean;
    contentId?: string;
  }[];
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
  /** Implicit TLS for SMTP. Null/undefined → derived from smtpPort. */
  smtpSecure?: boolean | null;
  /** Implicit TLS for IMAP. Null/undefined → derived from imapPort. */
  imapSecure?: boolean | null;
  /** @deprecated Legacy single flag; last-resort fallback for both transports. */
  secure?: boolean | null;
}

/**
 * Providers that already file SMTP-sent mail into Sent by themselves. Appending
 * our own copy there would show every sent message twice.
 */
const AUTO_SAVES_SENT_RE = /(^|\.)(gmail|googlemail)\.com$/i;

export function providerAutoSavesSent(smtpHost: string | null | undefined): boolean {
  return AUTO_SAVES_SENT_RE.test((smtpHost ?? '').trim().toLowerCase());
}

/** Mailbox names used for "Sent" when the server advertises no \Sent flag. */
const SENT_NAME_RE =
  /^(sent|sent[\s_-]?(items|messages|mail)|enviados|elementos enviados|correo enviado|gesendet|envoy[ée]s?|posta inviata)$/i;

/**
 * Pick the mailbox to append sent messages to. Prefers the RFC 6154 \Sent
 * special-use flag (works regardless of the server's language) and falls back
 * to well-known names — IONOS, older Dovecot and Exchange setups don't always
 * advertise special-use.
 */
export function pickSentMailbox(
  boxes: { path: string; name?: string; specialUse?: string }[],
): string | null {
  const flagged = boxes.find((b) => b.specialUse === '\\Sent');
  if (flagged) return flagged.path;
  const named = boxes.find((b) => SENT_NAME_RE.test((b.name ?? b.path).trim()));
  return named?.path ?? null;
}

/** Ports that speak TLS from the first byte (SMTPS / IMAPS). */
const IMPLICIT_TLS_PORTS = new Set([465, 993]);
/** Ports that start in the clear and upgrade via STARTTLS (or stay plain). */
const STARTTLS_PORTS = new Set([25, 143, 587]);

/**
 * Decide whether a transport uses implicit TLS on connect.
 *
 * Order: explicit per-transport setting → the port's standard behaviour → the
 * legacy shared flag. Port derivation beats the legacy flag because the legacy
 * flag was necessarily wrong for one of the two transports whenever they
 * disagreed (the Outlook case: SMTP 587 + IMAP 993).
 */
export function resolveSecure(
  explicit: boolean | null | undefined,
  port: number | null | undefined,
  legacy: boolean | null | undefined,
): boolean {
  if (explicit != null) return explicit;
  if (port != null) {
    if (IMPLICIT_TLS_PORTS.has(port)) return true;
    if (STARTTLS_PORTS.has(port)) return false;
  }
  return legacy ?? true;
}
