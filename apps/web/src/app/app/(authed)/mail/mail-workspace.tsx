'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';
import { MailComposer, type ComposerInitial, type ComposerMode } from './mail-composer';

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
  const [notesOpen, setNotesOpen] = useState(false);
  const [modal, setModal] = useState<
    { mode: ComposerMode; initial?: ComposerInitial; forwardMessageId?: string } | null
  >(null);

  const selfAddress = (connections.find((c) => c.id === connectionId)?.fromAddress ?? '').toLowerCase();
  const nameOf = (userId: string | null): string =>
    userId ? team.find((m) => m.id === userId)?.name ?? 'Asignado' : '';
  const initials = (name: string): string =>
    name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

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
    setNotesOpen(false);
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
        setReplyInit({ to: computeDefaultTo(d) });
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
      setReplyInit({ to: computeDefaultTo(d) });
      setReplyKey((k) => k + 1);
    } catch {
      /* ignore */
    }
    void loadThreads(connectionId, folder);
  }

  function openReply() {
    setReplyKey((k) => k + 1);
    setComposerOpen(true);
  }

  function replyAll() {
    const parts = (detail?.thread.participants ?? []).map((p) => p.toLowerCase());
    const to = (replyInit.to ?? '').toLowerCase();
    const others = parts.filter((p) => p !== selfAddress && p !== to);
    setReplyInit((prev) => ({ ...prev, cc: others.join(', ') }));
    setReplyKey((k) => k + 1);
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
    } finally {
      setBusy(false);
    }
  }

  async function assign(assigneeUserId: string) {
    if (!detail) return;
    const value = assigneeUserId || null;
    await apiFetch(`/mail/threads/${detail.thread.id}/assign`, { method: 'POST', json: { assigneeUserId: value } }).catch(() => {});
    setDetail((d) => (d ? { ...d, thread: { ...d.thread, assigneeUserId: value } } : d));
  }

  async function setStatus(status: string) {
    if (!detail) return;
    await apiFetch(`/mail/threads/${detail.thread.id}/status`, { method: 'POST', json: { status } }).catch(() => {});
    setDetail((d) => (d ? { ...d, thread: { ...d.thread, status } } : d));
    void loadThreads(connectionId, folder);
  }

  async function addNote() {
    if (!detail || !noteDraft.trim()) return;
    try {
      const n = await apiFetch<NoteRow>(`/mail/threads/${detail.thread.id}/notes`, { method: 'POST', json: { body: noteDraft.trim() } });
      setNotes((prev) => [...prev, n]);
      setNoteDraft('');
    } catch {
      /* ignore */
    }
  }

  async function deleteNote(id: string) {
    await apiFetch(`/mail/notes/${id}`, { method: 'DELETE' }).catch(() => {});
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function downloadAttachment(id: string) {
    try {
      const r = await apiFetch<{ url: string }>(`/mail/attachments/${id}/download`);
      window.open(r.url, '_blank', 'noopener');
    } catch {
      /* ignore */
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

  return (
    <div className="flex h-[calc(100vh-9rem)] gap-3">
      {/* Folders + mailbox selector */}
      <div className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto rounded-lg border border-ink-100 bg-white p-2">
        {connections.length > 1 ? (
          <select
            value={connectionId}
            onChange={(e) => switchMailbox(e.target.value)}
            className="mb-1 w-full rounded border border-ink-200 bg-white px-1.5 py-1 text-xs text-ink-700"
            aria-label="Buzón"
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fromAddress}
              </option>
            ))}
          </select>
        ) : (
          <div className="mb-1 truncate px-1 text-[11px] text-ink-500" title={connections[0]?.fromAddress}>
            {connections[0]?.fromAddress}
          </div>
        )}
        {FOLDERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFolder(f.key); setSelectedId(null); setDetail(null); setQuery(''); }}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${folder === f.key ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100'}`}
          >
            <span>{f.label}</span>
            {counts[f.key] ? (
              <span className="rounded-full bg-primary-600 px-1.5 text-[10px] font-semibold text-white">{counts[f.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Thread list */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-ink-100 bg-white">
        <div className="space-y-2 border-b border-ink-100 p-2">
          <button
            type="button"
            onClick={() => setModal({ mode: 'new', initial: {} })}
            className={buttonClass('primary', 'w-full text-xs')}
          >
            ✉️ Nuevo correo
          </button>
          <div className="relative">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedId(null); setDetail(null); }}
              placeholder="Buscar en el correo…"
              className="w-full rounded border border-ink-200 bg-white px-2 py-1 pr-6 text-xs focus:border-ink-700 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-ink-500">
              {searching ? 'Sin resultados.' : 'Sin mensajes en esta carpeta.'}
            </p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => void openThread(t.id)}
                className={`block w-full border-b border-ink-100 p-3 text-left hover:bg-ink-100/40 ${selectedId === t.id ? 'bg-ink-100/60' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${t.unreadCount > 0 ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                    {(t.participants && t.participants[0]) || 'Contacto'}
                  </span>
                  <span className="shrink-0 text-[10px] text-ink-400">{fmt(t.lastMessageAt)}</span>
                </div>
                <div className={`truncate text-xs ${t.unreadCount > 0 ? 'font-medium text-ink-800' : 'text-ink-500'}`}>{t.subject || '(sin asunto)'}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-ink-400">{t.snippet}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {t.assigneeUserId && (
                      <span
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-100 text-[8px] font-semibold text-primary-700"
                        title={nameOf(t.assigneeUserId)}
                      >
                        {initials(nameOf(t.assigneeUserId))}
                      </span>
                    )}
                    {t.status !== 'OPEN' && (
                      <span className={`rounded px-1 text-[9px] font-medium ${STATUS_BADGE[t.status] ?? ''}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    )}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread detail */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-ink-100 bg-white">
        {!detail ? (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-500">Selecciona un hilo.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink-100 px-4 py-2">
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
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
                ⚠️ {lock.byName} está respondiendo a este hilo ahora mismo.
              </div>
            )}
            <div className="flex-1 space-y-3 overflow-y-auto bg-ink-100/20 p-4">
              {visibleMessages.map((m) => (
                <div key={m.id} className="rounded-lg border border-ink-100 bg-white p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2 text-xs text-ink-500">
                    <span className="truncate font-medium text-ink-700">{m.fromName || m.fromAddress || (m.direction === 'OUT' ? 'Tú' : 'Contacto')}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span>{fmt(m.receivedAt || m.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => setModal({ mode: 'forward', forwardMessageId: m.id, initial: {} })}
                        className="text-primary-700 hover:underline"
                        title="Reenviar este mensaje"
                      >
                        Reenviar
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
                          className="rounded bg-ink-100 px-2 py-0.5 hover:bg-ink-200 hover:text-ink-800"
                          title="Descargar"
                        >
                          📎 {a.filename}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Internal notes — collapsed by default so they don't steal reading space */}
            {notesOpen && (
              <div className="border-t border-ink-100 bg-amber-50/40 px-3 py-2">
                {notes.length > 0 && (
                  <ul className="mb-2 max-h-32 space-y-1 overflow-y-auto">
                    {notes.map((n) => (
                      <li key={n.id} className="group flex items-start justify-between gap-2 rounded bg-white/70 px-2 py-1 text-xs">
                        <span className="min-w-0">
                          <span className="font-medium text-ink-700">{n.authorName}: </span>
                          <span className="text-ink-700">{n.body}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void deleteNote(n.id)}
                          className="shrink-0 text-ink-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                          aria-label="Borrar nota"
                        >
                          ✕
                        </button>
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
                  <button type="button" onClick={() => void addNote()} disabled={!noteDraft.trim()} className={buttonClass('secondary', 'px-2 py-1 text-xs')}>
                    Añadir
                  </button>
                </div>
              </div>
            )}

            {/* Reply: a slim action bar by default; the composer only expands on demand */}
            <div className="border-t border-ink-100 bg-white">
              {composerOpen ? (
                <div className="space-y-2 p-3">
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
                <div className="flex items-center gap-2 px-3 py-2">
                  <button type="button" onClick={openReply} className={buttonClass('primary', 'text-sm')}>Responder</button>
                  <button type="button" onClick={replyAll} className={buttonClass('secondary', 'text-sm')}>Responder a todos</button>
                  {lastMessageId && (
                    <button
                      type="button"
                      onClick={() => setModal({ mode: 'forward', forwardMessageId: lastMessageId, initial: {} })}
                      className={buttonClass('ghost', 'text-sm')}
                    >
                      Reenviar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNotesOpen((o) => !o)}
                    className={buttonClass('ghost', 'ml-auto text-sm')}
                  >
                    📝 Notas{notes.length ? ` (${notes.length})` : ''}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New / Forward modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:p-8" onClick={() => setModal(null)}>
          <div className="w-full max-w-2xl rounded-lg border border-ink-100 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <h3 className="text-sm font-semibold">{modal.mode === 'forward' ? 'Reenviar correo' : 'Nuevo correo'}</h3>
              <button type="button" onClick={() => setModal(null)} className="text-ink-400 hover:text-ink-700" aria-label="Cerrar">✕</button>
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
    </div>
  );
}
