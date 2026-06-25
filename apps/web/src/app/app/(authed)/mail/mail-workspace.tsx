'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  Inbox,
  Send,
  FileText,
  Ban,
  Archive,
  Trash2,
  Mail,
  Search,
  X,
  ArrowLeft,
  Forward,
  Paperclip,
  AlertTriangle,
  Loader2,
  Settings,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useFeedback } from '@/components/ui/feedback';
import { buttonClass } from '@/components/ui/primitives';
import {
  InboxShell,
  Avatar,
  DateSeparator,
  ContactPanel,
  ReplyNoteTabs,
} from '@/components/ui/inbox-kit';
import { MailComposer, type ComposerInitial, type ComposerMode } from './mail-composer';

type IconType = ComponentType<{ size?: number; className?: string }>;
const FOLDER_ICON: Record<string, IconType> = {
  INBOX: Inbox,
  SENT: Send,
  DRAFTS: FileText,
  SPAM: Ban,
  ARCHIVE: Archive,
  TRASH: Trash2,
};

interface AttachmentRow {
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
}

/** Build the signature block appended to a fresh composer (plain text → safe html). */
function signatureHtml(sig: string | null | undefined): string {
  const s = (sig ?? '').trim();
  if (!s) return '';
  const esc = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<p></p><p>—<br>${esc}</p>`;
}

interface ThreadRow {
  id: string;
  subject: string | null;
  snippet: string | null;
  participants: string[] | null;
  unreadCount: number;
  lastMessageAt: string | null;
  status: string;
  assigneeUserId: string | null;
}
interface Msg {
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
  createdAt: string;
  attachments: AttachmentRow[];
}
interface Detail {
  thread: {
    id: string;
    subject: string | null;
    folder: string;
    participants: string[] | null;
    status: string;
    assigneeUserId: string | null;
  };
  messages: Msg[];
}
interface TeamMember {
  id: string;
  name: string;
}
interface NoteRow {
  id: string;
  body: string;
  authorName: string;
  authorUserId: string;
  createdAt: string;
}
interface LockState {
  byMe: boolean;
  byName: string | null;
}

const STATUS_LABEL: Record<string, string> = { OPEN: 'Abierto', PENDING: 'Pendiente', CLOSED: 'Cerrado' };
const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-700',
  PENDING: 'bg-amber-100 text-amber-700',
  CLOSED: 'bg-ink-200 text-ink-600',
};
const STATUS_DOT: Record<string, string> = {
  OPEN: 'bg-green-400',
  PENDING: 'bg-amber-400',
  CLOSED: 'bg-ink-300',
};

const FOLDERS = [
  { key: 'INBOX', label: 'Recibidos' },
  { key: 'SENT', label: 'Enviados' },
  { key: 'DRAFTS', label: 'Borradores' },
  { key: 'SPAM', label: 'Spam' },
  { key: 'ARCHIVE', label: 'Archivo' },
  { key: 'TRASH', label: 'Papelera' },
];

const MOVES: Record<string, { folder: string; label: string }[]> = {
  INBOX: [
    { folder: 'ARCHIVE', label: 'Archivar' },
    { folder: 'SPAM', label: 'Spam' },
    { folder: 'TRASH', label: 'Papelera' },
  ],
  ARCHIVE: [
    { folder: 'INBOX', label: 'A Recibidos' },
    { folder: 'TRASH', label: 'Papelera' },
  ],
  SPAM: [
    { folder: 'INBOX', label: 'No es spam' },
    { folder: 'TRASH', label: 'Papelera' },
  ],
  TRASH: [{ folder: 'INBOX', label: 'Restaurar' }],
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function timeShort(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

const list = (v: string[] | null | undefined): string => (Array.isArray(v) ? v.join(', ') : '');

export function MailWorkspace({ connections }: { connections: MailboxOption[] }) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [folder, setFolder] = useState('INBOX');
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [replyInit, setReplyInit] = useState<ComposerInitial>({});
  const [replyKey, setReplyKey] = useState(0);
  const [query, setQuery] = useState('');
  const searching = query.trim().length >= 2;
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [lock, setLock] = useState<LockState | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTab, setComposerTab] = useState<'reply' | 'note'>('reply');
  const [loadingList, setLoadingList] = useState(true);
  const msgScrollRef = useRef<HTMLDivElement>(null);
  const fb = useFeedback();
  const [modal, setModal] = useState<
    { mode: ComposerMode; initial?: ComposerInitial; forwardMessageId?: string } | null
  >(null);

  const currentConn = connections.find((c) => c.id === connectionId);
  const selfAddress = (currentConn?.fromAddress ?? '').toLowerCase();
  const sigHtml = signatureHtml(currentConn?.signature);
  const nameOf = (userId: string | null): string =>
    userId ? team.find((m) => m.id === userId)?.name ?? 'Asignado' : '';

  const loadThreads = useCallback(async (conn: string, f: string) => {
    if (!conn) return;
    try {
      const [t, c] = await Promise.all([
        apiFetch<ThreadRow[]>(`/mail/connections/${conn}/threads?folder=${f}`),
        apiFetch<Record<string, number>>(`/mail/connections/${conn}/folder-counts`).catch(() => ({})),
      ]);
      setThreads(t);
      setCounts(c);
    } catch {
      /* keep last */
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (searching) return; // pause folder polling while searching
    void loadThreads(connectionId, folder);
    const t = setInterval(() => void loadThreads(connectionId, folder), 15000);
    return () => clearInterval(t);
  }, [connectionId, folder, loadThreads, searching]);

  // Team list (assignee picker + name resolution), loaded once.
  useEffect(() => {
    apiFetch<TeamMember[]>('/mail/team').then(setTeam).catch(() => {});
  }, []);

  // Reply-lock heartbeat while a thread is open (anti-collision).
  useEffect(() => {
    if (!selectedId) return;
    const id = selectedId;
    const beat = () =>
      apiFetch<LockState>(`/mail/threads/${id}/claim`, { method: 'POST' })
        .then(setLock)
        .catch(() => {});
    void beat();
    const t = setInterval(beat, 30000);
    return () => {
      clearInterval(t);
      apiFetch(`/mail/threads/${id}/release`, { method: 'POST' }).catch(() => {});
    };
  }, [selectedId]);

  // Poll the OPEN thread so replies from third parties appear without reselecting.
  // Only swaps in fresh messages — never touches the reply composer/draft state.
  useEffect(() => {
    if (!selectedId) return;
    const id = selectedId;
    const t = setInterval(async () => {
      try {
        const d = await apiFetch<Detail>(`/mail/threads/${id}`);
        setDetail((prev) => (prev && prev.thread.id === id ? d : prev));
      } catch {
        /* keep last */
      }
    }, 12000);
    return () => clearInterval(t);
  }, [selectedId]);

  // Debounced search across all folders of the mailbox.
  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<ThreadRow[]>(
          `/mail/connections/${connectionId}/search?q=${encodeURIComponent(query.trim())}`,
        );
        setThreads(r);
      } catch {
        /* keep last */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searching, query, connectionId]);

  // Jump to the latest message when a thread opens or grows.
  useEffect(() => {
    const el = msgScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail?.thread.id, detail?.messages.length]);

  function switchMailbox(id: string) {
    setConnectionId(id);
    setFolder('INBOX');
    setSelectedId(null);
    setDetail(null);
    setQuery('');
  }

  function computeDefaultTo(d: Detail): string {
    const lastIn = [...d.messages].reverse().find((m) => m.direction === 'IN' && !m.isDraft);
    if (lastIn?.fromAddress) return lastIn.fromAddress;
    const parts = d.thread.participants ?? [];
    return parts.find((p) => p.toLowerCase() !== selfAddress) ?? parts[0] ?? '';
  }

  async function openThread(id: string) {
    setSelectedId(id);
    setDetail(null);
    setReplyInit({});
    setNotes([]);
    setNoteDraft('');
    setLock(null);
    setComposerOpen(false);
    setComposerTab('reply');
    apiFetch<NoteRow[]>(`/mail/threads/${id}/notes`).then(setNotes).catch(() => {});
    try {
      const d = await apiFetch<Detail>(`/mail/threads/${id}`);
      const draft = d.messages.find((m) => m.isDraft);
      if (draft) {
        const init: ComposerInitial = {
          draftId: draft.id,
          to: list(draft.toAddresses),
          cc: list(draft.ccAddresses),
          bcc: list(draft.bccAddresses),
          subject: draft.subject ?? '',
          html: draft.html ?? '',
          attachments: draft.attachments.map((a) => ({
            storageKey: a.storageKey,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
          })),
        };
        if (d.thread.folder === 'DRAFTS') {
          // Brand-new email draft → reopen it in the modal composer.
          setSelectedId(null);
          setModal({ mode: 'new', initial: init });
          return;
        }
        // Reply draft → prefill and auto-open the composer to continue it.
        setReplyInit(init);
        setComposerOpen(true);
      } else {
        setReplyInit({ to: computeDefaultTo(d), html: sigHtml });
      }
      setReplyKey((k) => k + 1);
      setDetail(d);
      await apiFetch(`/mail/threads/${id}/read`, { method: 'POST' }).catch(() => {});
      void loadThreads(connectionId, folder);
    } catch {
      /* ignore */
    }
  }

  async function refreshThread() {
    if (!selectedId) return;
    try {
      const d = await apiFetch<Detail>(`/mail/threads/${selectedId}`);
      setDetail(d);
      setReplyInit({ to: computeDefaultTo(d), html: sigHtml });
      setReplyKey((k) => k + 1);
    } catch {
      /* ignore */
    }
    void loadThreads(connectionId, folder);
  }

  function openReply() {
    setComposerTab('reply');
    setReplyKey((k) => k + 1);
    setComposerOpen(true);
  }

  function replyAll() {
    const parts = (detail?.thread.participants ?? []).map((p) => p.toLowerCase());
    const to = (replyInit.to ?? '').toLowerCase();
    const others = parts.filter((p) => p !== selfAddress && p !== to);
    setReplyInit((prev) => ({ ...prev, cc: others.join(', ') }));
    setReplyKey((k) => k + 1);
    setComposerTab('reply');
    setComposerOpen(true);
  }

  async function move(toFolder: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await apiFetch(`/mail/threads/${selectedId}/move`, { method: 'POST', json: { folder: toFolder } });
      setSelectedId(null);
      setDetail(null);
      await loadThreads(connectionId, folder);
    } catch {
      fb.toast.error('No se pudo mover el hilo');
    } finally {
      setBusy(false);
    }
  }

  async function assign(assigneeUserId: string) {
    if (!detail) return;
    const value = assigneeUserId || null;
    try {
      await apiFetch(`/mail/threads/${detail.thread.id}/assign`, { method: 'POST', json: { assigneeUserId: value } });
      setDetail((d) => (d ? { ...d, thread: { ...d.thread, assigneeUserId: value } } : d));
    } catch {
      fb.toast.error('No se pudo cambiar la asignación');
    }
  }

  async function setStatus(status: string) {
    if (!detail) return;
    try {
      await apiFetch(`/mail/threads/${detail.thread.id}/status`, { method: 'POST', json: { status } });
      setDetail((d) => (d ? { ...d, thread: { ...d.thread, status } } : d));
      void loadThreads(connectionId, folder);
    } catch {
      fb.toast.error('No se pudo cambiar el estado');
    }
  }

  async function addNote() {
    if (!detail || !noteDraft.trim()) return;
    try {
      const n = await apiFetch<NoteRow>(`/mail/threads/${detail.thread.id}/notes`, { method: 'POST', json: { body: noteDraft.trim() } });
      setNotes((prev) => [...prev, n]);
      setNoteDraft('');
    } catch {
      fb.toast.error('No se pudo añadir la nota');
    }
  }

  async function deleteNote(id: string) {
    try {
      await apiFetch(`/mail/notes/${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      fb.toast.error('No se pudo borrar la nota');
    }
  }

  async function downloadAttachment(id: string) {
    try {
      const r = await apiFetch<{ url: string }>(`/mail/attachments/${id}/download`);
      window.open(r.url, '_blank', 'noopener');
    } catch {
      fb.toast.error('No se pudo descargar el adjunto');
    }
  }

  async function markUnread() {
    if (!selectedId) return;
    await apiFetch(`/mail/threads/${selectedId}/unread`, { method: 'POST' }).catch(() => {});
    setSelectedId(null);
    setDetail(null);
    void loadThreads(connectionId, folder);
  }

  const visibleMessages = detail ? detail.messages.filter((m) => !m.isDraft) : [];
  const lastMessageId = visibleMessages.length ? visibleMessages[visibleMessages.length - 1]!.id : null;

  // ---- column: filters (folders + mailbox) ----
  const filtersNode = (
    <div className="flex h-full flex-col">
      {connections.length > 1 && (
        <div className="border-b border-ink-100 p-2">
          <select
            value={connectionId}
            onChange={(e) => switchMailbox(e.target.value)}
            className="w-full rounded border border-ink-200 bg-white px-1.5 py-1 text-xs text-ink-700"
            aria-label="Buzón"
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.fromAddress}</option>
            ))}
          </select>
        </div>
      )}
      <nav className="flex-1 space-y-0.5 p-2">
        {FOLDERS.map((f) => {
          const Icon = FOLDER_ICON[f.key] ?? Inbox;
          const active = folder === f.key;
          const n = counts[f.key] ?? 0;
          return (
            <button
              key={f.key}
              onClick={() => { setFolder(f.key); setSelectedId(null); setDetail(null); setQuery(''); }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${active ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100'}`}
            >
              <Icon size={16} />
              <span className="flex-1 text-left">{f.label}</span>
              {n > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-semibold ${active ? 'bg-white/20 text-white' : 'bg-primary-600 text-white'}`}>
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <Link
        href="/app/mail/ajustes"
        className="mt-auto flex items-center gap-2 border-t border-ink-100 px-3 py-2 text-xs text-ink-500 hover:bg-ink-100 hover:text-ink-800"
      >
        <Settings size={14} /> Ajustes (buzones, plantillas)
      </Link>
    </div>
  );

  // ---- column: thread list ----
  const listNode = (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-ink-100 p-2">
        <button
          type="button"
          onClick={() => setModal({ mode: 'new', initial: { html: sigHtml } })}
          className={buttonClass('primary', 'flex w-full items-center justify-center gap-1.5 text-xs')}
        >
          <Mail size={14} /> Nuevo correo
        </button>
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedId(null); setDetail(null); }}
            placeholder="Buscar en el correo…"
            className="w-full rounded border border-ink-200 bg-white px-2 py-1 pl-7 pr-6 text-xs focus:border-ink-700 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
              aria-label="Limpiar búsqueda"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loadingList && threads.length === 0 ? (
          <div className="space-y-3 p-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse gap-2.5">
                <div className="h-8 w-8 shrink-0 rounded-full bg-ink-100" />
                <div className="flex-1 space-y-1.5 py-0.5">
                  <div className="h-3 w-2/3 rounded bg-ink-100" />
                  <div className="h-2.5 w-1/2 rounded bg-ink-100" />
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-ink-500">
            <Inbox size={28} className="text-ink-300" />
            {searching ? 'Sin resultados.' : 'Sin mensajes en esta carpeta.'}
          </div>
        ) : (
          threads.map((t) => {
            const who = (t.participants && t.participants[0]) || 'Contacto';
            return (
              <button
                key={t.id}
                onClick={() => void openThread(t.id)}
                className={`flex w-full gap-2.5 border-b border-ink-100 p-2.5 text-left hover:bg-ink-100/50 ${selectedId === t.id ? 'bg-primary-50' : ''}`}
              >
                <Avatar name={who} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[t.status] ?? 'bg-ink-300'}`} title={`Estado: ${STATUS_LABEL[t.status] ?? t.status}`} />
                      <span className={`truncate text-sm ${t.unreadCount > 0 ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>{who}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-400">{timeShort(t.lastMessageAt)}</span>
                  </div>
                  <div className={`truncate text-xs ${t.unreadCount > 0 ? 'font-medium text-ink-800' : 'text-ink-500'}`}>{t.subject || '(sin asunto)'}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-ink-400">{t.snippet}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {t.unreadCount > 0 && (
                        <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-semibold text-white">{t.unreadCount}</span>
                      )}
                      {t.assigneeUserId ? (
                        <Avatar name={nameOf(t.assigneeUserId)} size="sm" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-dashed border-ink-300" title="Sin asignar" />
                      )}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  // ---- column: thread ----
  let lastDay = '';
  const threadNode = !detail ? (
    <div className="flex flex-1 items-center justify-center text-sm text-ink-500">
      {selectedId ? <Loader2 size={22} className="animate-spin text-ink-300" /> : 'Selecciona un hilo.'}
    </div>
  ) : (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink-100 px-3 py-2 md:px-4">
        <button
          type="button"
          onClick={() => { setSelectedId(null); setDetail(null); }}
          className="-ml-1 shrink-0 rounded p-1 text-ink-500 hover:bg-ink-100 lg:hidden"
          aria-label="Volver"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{detail.thread.subject || '(sin asunto)'}</h2>
        <select
          value={detail.thread.assigneeUserId ?? ''}
          onChange={(e) => void assign(e.target.value)}
          title="Asignar"
          className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-xs text-ink-700"
        >
          <option value="">Sin asignar</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select
          value={detail.thread.status}
          onChange={(e) => void setStatus(e.target.value)}
          title="Estado"
          className={`rounded border border-ink-200 px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[detail.thread.status] ?? 'text-ink-700'}`}
        >
          {Object.keys(STATUS_LABEL).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        {(MOVES[folder] ?? []).map((m) => (
          <button key={m.folder} disabled={busy} onClick={() => void move(m.folder)} className={buttonClass('ghost', 'px-1.5 py-0.5 text-xs')}>{m.label}</button>
        ))}
        <button onClick={() => void markUnread()} className={buttonClass('ghost', 'px-1.5 py-0.5 text-xs')}>No leído</button>
      </div>

      {lock && !lock.byMe && (
        <div className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          <AlertTriangle size={13} /> {lock.byName} está respondiendo a este hilo ahora mismo.
        </div>
      )}

      <div ref={msgScrollRef} className="flex-1 space-y-1 overflow-y-auto bg-ink-100/20 p-4">
        {visibleMessages.map((m) => {
          const ts = m.receivedAt || m.createdAt;
          const k = dayKey(ts);
          const sep = k !== lastDay ? <DateSeparator label={dayLabel(ts)} /> : null;
          lastDay = k;
          const out = m.direction === 'OUT';
          const who = out ? 'Tú' : m.fromName || m.fromAddress || 'Contacto';
          return (
            <Fragment key={m.id}>
              {sep}
              <div className={`flex gap-2 py-1 ${out ? 'flex-row-reverse' : ''}`}>
                <Avatar name={who} size="sm" />
                <div className={`min-w-0 max-w-[85%] rounded-lg border p-3 ${out ? 'border-primary-100 bg-primary-50' : 'border-ink-100 bg-white'}`}>
                  <div className="mb-2 flex items-baseline justify-between gap-2 text-xs text-ink-500">
                    <span className={`truncate font-medium ${out ? 'text-primary-800' : 'text-ink-700'}`}>{who}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span>{fmt(ts)}</span>
                      <button
                        type="button"
                        onClick={() => setModal({ mode: 'forward', forwardMessageId: m.id, initial: { html: sigHtml } })}
                        className="inline-flex items-center gap-1 text-primary-700 hover:underline"
                        title="Reenviar este mensaje"
                      >
                        <Forward size={11} /> Reenviar
                      </button>
                    </span>
                  </div>
                  {m.html ? (
                    <div
                      className="text-sm [&_a]:text-primary-700 [&_a]:underline [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-1"
                      dangerouslySetInnerHTML={{ __html: m.html }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-ink-800">{m.text}</p>
                  )}
                  {m.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-ink-100 pt-2 text-xs text-ink-500">
                      {m.attachments.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => void downloadAttachment(a.id)}
                          className="inline-flex items-center gap-1 rounded bg-ink-100 px-2 py-0.5 hover:bg-ink-200 hover:text-ink-800"
                          title="Descargar"
                        >
                          <Paperclip size={11} /> {a.filename}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <ReplyNoteTabs
        tab={composerTab}
        onTab={setComposerTab}
        noteCount={notes.length}
        reply={
          composerOpen ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink-600">Responder</span>
                <button type="button" onClick={() => setComposerOpen(false)} className="text-ink-400 hover:text-ink-700">✕ Cerrar</button>
              </div>
              <MailComposer
                key={replyKey}
                mode="reply"
                connectionId={connectionId}
                threadId={detail.thread.id}
                initial={replyInit}
                onSent={() => { setComposerOpen(false); void refreshThread(); }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={openReply} className={buttonClass('primary', 'text-sm')}>Responder</button>
              <button type="button" onClick={replyAll} className={buttonClass('secondary', 'text-sm')}>Responder a todos</button>
              {lastMessageId && (
                <button
                  type="button"
                  onClick={() => setModal({ mode: 'forward', forwardMessageId: lastMessageId, initial: { html: sigHtml } })}
                  className={buttonClass('ghost', 'flex items-center gap-1.5 text-sm')}
                >
                  <Forward size={14} /> Reenviar
                </button>
              )}
            </div>
          )
        }
        note={
          <div className="space-y-2">
            {notes.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {notes.map((n) => (
                  <li key={n.id} className="group flex items-start justify-between gap-2 rounded bg-white/70 px-2 py-1 text-xs">
                    <span className="min-w-0">
                      <span className="font-medium text-ink-700">{n.authorName}: </span>
                      <span className="text-ink-700">{n.body}</span>
                    </span>
                    <button type="button" onClick={() => void deleteNote(n.id)} className="shrink-0 text-ink-300 opacity-0 hover:text-red-600 group-hover:opacity-100" aria-label="Borrar nota">✕</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addNote(); } }}
                placeholder="Añadir nota interna para el equipo…"
                className="flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-xs focus:border-amber-400 focus:outline-none"
              />
              <button type="button" onClick={() => void addNote()} disabled={!noteDraft.trim()} className={buttonClass('secondary', 'px-2 py-1 text-xs')}>Añadir</button>
            </div>
          </div>
        }
      />
    </>
  );

  // ---- column: contact details ----
  const detailsNode = detail ? (
    <ContactPanel
      name={(detail.thread.participants && detail.thread.participants[0]) || 'Contacto'}
      sub={currentConn ? `vía ${currentConn.fromAddress}` : null}
      fields={[
        {
          label: 'Estado',
          value: (
            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[detail.thread.status] ?? ''}`}>
              {STATUS_LABEL[detail.thread.status] ?? detail.thread.status}
            </span>
          ),
        },
        { label: 'Asignado a', value: detail.thread.assigneeUserId ? nameOf(detail.thread.assigneeUserId) : 'Sin asignar' },
        { label: 'Participantes', value: (detail.thread.participants ?? []).join(', ') || '—' },
        { label: 'Notas internas', value: notes.length ? `${notes.length}` : 'Ninguna' },
      ]}
    />
  ) : undefined;

  return (
    <>
      <InboxShell
        hasSelection={!!selectedId}
        filters={filtersNode}
        list={listNode}
        thread={threadNode}
        details={detailsNode}
      />

      {/* New / Forward modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:p-8" onClick={() => setModal(null)}>
          <div className="w-full max-w-2xl rounded-lg border border-ink-100 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <h3 className="text-sm font-semibold">{modal.mode === 'forward' ? 'Reenviar correo' : 'Nuevo correo'}</h3>
              <button type="button" onClick={() => setModal(null)} className="text-ink-400 hover:text-ink-700" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="p-4">
              <MailComposer
                key={`${modal.mode}-${modal.forwardMessageId ?? modal.initial?.draftId ?? 'new'}`}
                mode={modal.mode}
                connectionId={connectionId}
                forwardMessageId={modal.forwardMessageId}
                initial={modal.initial}
                onSent={() => { setModal(null); void loadThreads(connectionId, folder); }}
                onClose={() => setModal(null)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
