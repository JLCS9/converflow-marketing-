'use client';

/**
 * Email thread rendering — mail, not chat.
 *
 * The thread used to reuse the instant-messaging bubbles (right-aligned for
 * outbound, avatar, the label "Tú"). That metaphor hides everything that
 * matters in email: who exactly sent it, who it went to, and who was in copy.
 * These cards are full width with a real From/To/Cc header, collapsed by
 * default except the last one, the way a mail client does it.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Forward, Languages, Paperclip, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/inbox-kit';
import { apiFetch } from '@/lib/api-client';
import { aiErrorMessage } from './ai-error';
import { authorshipOf, UI_LANG, type Authorship, type AttachmentRow, type Msg } from './mail-types';

/**
 * Per-message translation, shown BESIDE the original and never replacing it —
 * the original has to stay auditable. Offered only when the detected language
 * differs from the UI's (or is unknown); a "Traducir" button on a message
 * already in your language is noise.
 */
function TranslateBlock({ msg }: { msg: Msg }) {
  const t = useTranslations('mail');
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  if (msg.detectedLang === UI_LANG) return null;

  async function run() {
    if (text) {
      setOpen((v) => !v);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<{ text: string; sameLanguage: boolean }>(
        `/mail/messages/${msg.id}/ai/translate`,
        { method: 'POST', json: { lang: UI_LANG } },
      );
      setText(r.sameLanguage ? null : r.text);
      if (r.sameLanguage) setError(t('alreadyInLanguage'));
      setOpen(true);
    } catch (err) {
      setError(aiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 border-t border-ink-100 pt-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={loading}
        className="inline-flex items-center gap-1 text-[11px] text-primary-700 hover:underline disabled:opacity-50"
      >
        <Languages size={11} />
        {loading ? t('translating') : text ? (open ? t('hideTranslation') : t('showTranslation')) : t('translate')}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-700">{error}</p>}
      {text && open && (
        <div className="mt-1.5 rounded border border-primary-100 bg-primary-50/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-primary-700">
            Traducción automática
          </p>
          <p className="whitespace-pre-wrap text-sm text-ink-800">{text}</p>
        </div>
      )}
    </div>
  );
}

/** "Nombre Apellido" → "Nombre A." for compact headers. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? name;
  return `${parts[0]} ${parts[1]![0]!.toUpperCase()}.`;
}

function fullDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Resolve an address to a display label: CRM contact name > mailbox > address. */
export type AddressLabeller = (address: string) => string | null;

function AddressList({
  label,
  addresses,
  labelFor,
}: {
  label: string;
  addresses: string[] | null | undefined;
  labelFor: AddressLabeller;
}) {
  const list = (addresses ?? []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="flex gap-1.5">
      <span className="w-10 shrink-0 text-ink-400">{label}</span>
      <span className="min-w-0 flex-1 break-words text-ink-600">
        {list.map((a, i) => {
          const named = labelFor(a);
          return (
            <span key={`${a}-${i}`}>
              {i > 0 && ', '}
              {named ? (
                <span title={a}>
                  {named} <span className="text-ink-400">&lt;{a}&gt;</span>
                </span>
              ) : (
                a
              )}
            </span>
          );
        })}
      </span>
    </div>
  );
}

/** Per-authorship styling. Three distinct treatments, no left/right games. */
const CARD_STYLE: Record<Authorship, string> = {
  contact: 'border-ink-200 bg-white',
  me: 'border-primary-200 bg-primary-50/60',
  teammate: 'border-violet-200 bg-violet-50/50',
};

const SENDER_STYLE: Record<Authorship, string> = {
  contact: 'text-ink-900',
  me: 'text-primary-900',
  teammate: 'text-violet-900',
};

export function MessageCard({
  msg,
  mailboxAddress,
  currentUserId,
  labelFor,
  expandedByDefault,
  onForward,
  onDownloadAttachment,
}: {
  msg: Msg;
  mailboxAddress: string;
  currentUserId: string;
  labelFor: AddressLabeller;
  expandedByDefault: boolean;
  onForward: (msg: Msg) => void;
  onDownloadAttachment: (a: AttachmentRow) => void;
}) {
  const t = useTranslations('mail');
  const ti = useTranslations('inbox');
  const [open, setOpen] = useState(expandedByDefault);
  const [showDetails, setShowDetails] = useState(false);
  const who = authorshipOf(msg, currentUserId);
  // Outbound has no receivedAt, so falling straight through to createdAt showed
  // the row's insertion time instead of when the mail actually went out.
  const ts = msg.sentAt || msg.receivedAt || msg.createdAt;

  // Outbound mail leaves from the mailbox, but a PERSON pressed send. Show both:
  // "María G. vía ventas@empresa.com".
  const person = msg.sentBy?.name ?? null;
  const senderName =
    who === 'contact'
      ? msg.fromName || msg.fromAddress || ti('contact')
      : person
        ? shortName(person)
        : t('yourTeam');
  const senderAddress = who === 'contact' ? msg.fromAddress : mailboxAddress;

  return (
    <article className={`rounded-lg border ${CARD_STYLE[who]}`}>
      {/* Header — always visible, click to collapse/expand. */}
      <header className="flex items-start gap-3 p-3">
        <Avatar name={senderName} size="sm" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-sm font-semibold ${SENDER_STYLE[who]}`}>
              {senderName}
              {who !== 'contact' && (
                <span className="ml-1 font-normal text-ink-400">
                  vía {mailboxAddress}
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-ink-400" title={fullDate(ts)}>
              {shortDate(ts)}
            </span>
          </div>
          {open ? (
            <div className="mt-1 space-y-0.5 text-xs">
              <AddressList label={t('from')} addresses={senderAddress ? [senderAddress] : []} labelFor={labelFor} />
              <AddressList label={t('toShort')} addresses={msg.toAddresses} labelFor={labelFor} />
              <AddressList label={t('ccShort')} addresses={msg.ccAddresses} labelFor={labelFor} />
            </div>
          ) : (
            <p className="mt-0.5 truncate text-xs text-ink-500">
              {(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 140) || t('noContent')}
            </p>
          )}
        </button>
        <ChevronDown
          size={15}
          className={`mt-1 shrink-0 text-ink-300 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </header>

      {open && (
        <div className="border-t border-ink-100 px-3 pb-3">
          <div className="flex items-center justify-between gap-2 py-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-ink-400 hover:text-ink-700"
            >
              {showDetails ? t('hideDetails') : t('details')}
            </button>
            <button
              type="button"
              onClick={() => onForward(msg)}
              className="inline-flex items-center gap-1 text-primary-700 hover:underline"
              title={t('forwardThis')}
            >
              <Forward size={11} /> {t('forward')}
            </button>
          </div>

          {showDetails && (
            <dl className="mb-2 space-y-0.5 rounded border border-ink-100 bg-ink-100/30 p-2 text-xs">
              <AddressList label="Cco" addresses={msg.bccAddresses} labelFor={labelFor} />
              <div className="flex gap-1.5">
                <span className="w-10 shrink-0 text-ink-400">{t('date')}</span>
                <span className="text-ink-600">{fullDate(ts)}</span>
              </div>
              {msg.subject && (
                <div className="flex gap-1.5">
                  <span className="w-10 shrink-0 text-ink-400">{t('subject')}</span>
                  <span className="break-words text-ink-600">{msg.subject}</span>
                </div>
              )}
              {who !== 'contact' && person && (
                <div className="flex gap-1.5">
                  <span className="w-10 shrink-0 text-ink-400">{t('sentVia')}</span>
                  <span className="inline-flex items-center gap-1 text-ink-600">
                    <Users size={11} /> {person}
                  </span>
                </div>
              )}
            </dl>
          )}

          {msg.html ? (
            <div
              className="text-sm [&_a]:text-primary-700 [&_a]:underline [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-1"
              dangerouslySetInnerHTML={{ __html: msg.html }}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-ink-800">{msg.text}</p>
          )}

          <TranslateBlock msg={msg} />

          {msg.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 border-t border-ink-100 pt-2">
              {msg.attachments.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onDownloadAttachment(a)}
                  className="inline-flex items-center gap-1 rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-600 hover:bg-ink-200 hover:text-ink-800"
                  title={`Descargar · ${humanSize(a.sizeBytes)}`}
                >
                  <Paperclip size={11} /> {a.filename}
                  <span className="text-ink-400">{humanSize(a.sizeBytes)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** How many trailing messages start expanded. */
const EXPANDED_TAIL = 1;

/**
 * A message starts open if it is the newest, or if it is unread inbound mail —
 * arriving at a thread with three new replies and finding them all folded would
 * be worse than useless.
 *
 * Only read on mount (MessageCard keeps its own open state, keyed by message
 * id), so the 12s thread poller marking the thread read can never collapse a
 * card the user is in the middle of reading.
 */
function startsOpen(m: Msg, index: number, total: number): boolean {
  if (index >= total - EXPANDED_TAIL) return true;
  return m.direction === 'IN' && !m.readAt;
}
/** Above this, the middle of the thread is folded behind a single button. */
const COLLAPSE_THRESHOLD = 4;

export function ThreadMessages({
  messages,
  mailboxAddress,
  currentUserId,
  labelFor,
  onForward,
  onDownloadAttachment,
}: {
  messages: Msg[];
  mailboxAddress: string;
  currentUserId: string;
  labelFor: AddressLabeller;
  onForward: (msg: Msg) => void;
  onDownloadAttachment: (a: AttachmentRow) => void;
}) {
  const t = useTranslations('mail');
  const [showAll, setShowAll] = useState(false);
  const hidden = Math.max(messages.length - COLLAPSE_THRESHOLD, 0);
  // Keep the first message (it opens the conversation) and the recent tail.
  const visible =
    showAll || !hidden
      ? messages
      : [messages[0]!, ...messages.slice(messages.length - (COLLAPSE_THRESHOLD - 1))];

  return (
    <div className="space-y-2">
      {visible.map((m, i) => (
        <div key={m.id}>
          {!showAll && hidden > 0 && i === 1 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mb-2 w-full rounded-lg border border-dashed border-ink-200 py-1.5 text-xs text-ink-500 hover:border-ink-300 hover:bg-ink-100/50 hover:text-ink-700"
            >
              {hidden} {hidden === 1 ? t('prevOne') : t('prevMany')}
            </button>
          )}
          <MessageCard
            msg={m}
            mailboxAddress={mailboxAddress}
            currentUserId={currentUserId}
            labelFor={labelFor}
            expandedByDefault={startsOpen(m, i, visible.length)}
            onForward={onForward}
            onDownloadAttachment={onDownloadAttachment}
          />
        </div>
      ))}
    </div>
  );
}
