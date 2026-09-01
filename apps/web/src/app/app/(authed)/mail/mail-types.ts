/**
 * Shared shapes for the mail workspace.
 *
 * Extracted so the thread view, the list and the composer can be separate
 * components instead of one 900-line file.
 */

export interface AttachmentRow {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}

export interface MailboxOption {
  id: string;
  fromAddress: string;
  displayName: string | null;
  signature: string | null;
  visibility: string;
}

export interface ThreadRow {
  id: string;
  subject: string | null;
  snippet: string | null;
  participants: string[] | null;
  unreadCount: number;
  /** Sin leer PARA MÍ (estado por usuario en buzones compartidos). */
  unreadForMe?: boolean;
  lastMessageAt: string | null;
  status: string;
  assigneeUserId: string | null;
}

export interface Msg {
  id: string;
  direction: 'IN' | 'OUT';
  isDraft: boolean;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string[] | null;
  ccAddresses: string[] | null;
  bccAddresses: string[] | null;
  subject: string | null;
  html: string | null;
  text: string | null;
  receivedAt: string | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
  attachments: AttachmentRow[];
  /** Team member who sent it (OUT only). Null for inbound and for legacy rows. */
  sentByUserId: string | null;
  /** ISO-639-1 guessed at ingest. Null = unknown (older rows, or too short). */
  detectedLang: string | null;
  sentBy: { id: string; name: string } | null;
}

export interface ContactInfo {
  type: 'lead' | 'client';
  id: string;
  name: string;
}

export interface Detail {
  thread: {
    id: string;
    subject: string | null;
    folder: string;
    participants: string[] | null;
    status: string;
    assigneeUserId: string | null;
  };
  messages: Msg[];
  contact: ContactInfo | null;
}

export interface TeamMember {
  id: string;
  name: string;
}

export interface NoteRow {
  id: string;
  body: string;
  authorName: string;
  authorUserId: string;
  createdAt: string;
}

export interface LockState {
  byMe: boolean;
  byName: string | null;
}

/** Paged list response from `/mail/connections/:id/threads` and `/search`. */
export interface ThreadPage {
  items: ThreadRow[];
  nextCursor: string | null;
}

/** Who, from our side, a message came from — drives the visual treatment. */
export type Authorship = 'contact' | 'me' | 'teammate';

export function authorshipOf(m: Msg, currentUserId: string): Authorship {
  if (m.direction === 'IN') return 'contact';
  // A legacy OUT message with no sender recorded is shown as the team's, not
  // claimed as yours — better vague than wrong.
  if (m.sentByUserId && m.sentByUserId === currentUserId) return 'me';
  return 'teammate';
}

export type ThreadState = 'WAITING_US' | 'WAITING_THEM' | 'BLOCKED' | 'CLOSED';

export interface ThreadSummary {
  bullets: string[];
  asks: string[];
  nextStep: string;
  state: ThreadState;
}

/** UI language of the app. Messages already in it get no "Traducir" button. */
export const UI_LANG = 'es';
