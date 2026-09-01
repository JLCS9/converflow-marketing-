'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  Inbox,
  Send,
  FileText,
  Ban,
  Archive,
  Trash2,
  X,
  ArrowLeft,
  Forward,
  AlertTriangle,
  Loader2,
  Settings,
} from 'lucide-react';
import { buildReplyAllRecipients } from '@converflow/shared';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/session-context';
import { useFeedback } from '@/components/ui/feedback';
import { buttonClass } from '@/components/ui/primitives';
import {
  InboxShell,
  InboxSwitch,
  ContactPanel,
  ReplyNoteTabs,
} from '@/components/ui/inbox-kit';
import { LeadDrawer } from '@/components/lead/lead-drawer';
import { MailComposer, type ComposerInitial, type ComposerMode } from './mail-composer';
import { ThreadMessages, type AddressLabeller } from './mail-message-card';
import { MailThreadList } from './mail-thread-list';
import { MailAiPanel } from './mail-ai-panel';
import type {
  ContactInfo,
  Detail,
  Msg,
  LockState,
  MailboxOption,
  NoteRow,
  TeamMember,
  ThreadPage,
  ThreadRow,
} from './mail-types';

// Re-exported so `page.tsx` keeps importing the mailbox shape from here.
export type { MailboxOption } from './mail-types';

type IconType = ComponentType<{ size?: number; className?: string }>;
const FOLDER_ICON: Record<string, IconType> = {
  INBOX: Inbox,
  SENT: Send,
  DRAFTS: FileText,
  SPAM: Ban,
  ARCHIVE: Archive,
  TRASH: Trash2,
};

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

/** Default subject when forwarding: "Fwd: <original>" without stacked Re:/Fwd: prefixes. */
function fwdSubject(original: string | null | undefined): string {
  const base = (original ?? '').replace(/^((re|rv|fwd|fw)\s*:\s*)+/i, '').trim();
  return base ? `Fwd: ${base}` : '';
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


const list = (v: string[] | null | undefined): string => (Array.isArray(v) ? v.join(', ') : '');

export function MailWorkspace({
  connections,
  mailUnread,
  imPending,
  initialConnectionId,
  initialThreadId,
}: {
  connections: MailboxOption[];
  mailUnread: number;
  imPending: number;
  /** Enlace profundo (?conn=&thread=): lo usan las tareas de asignación. */
  initialConnectionId?: string;
  initialThreadId?: string;
}) {
  const { userId } = useSession();
  const [connectionId, setConnectionId] = useState(() => {
    // El enlace profundo manda, si apunta a un buzón al que tengo acceso.
    if (initialConnectionId && connections.some((c) => c.id === initialConnectionId)) {
      return initialConnectionId;
    }
    return connections[0]?.id ?? '';
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** True once the user loaded extra pages, so the poller stops truncating. */
  const pagedRef = useRef(false);
  const mineRef = useRef(false);
  // «Solo los míos»: preferencia por usuario, persistida en el navegador.
  const [onlyMine, setOnlyMineState] = useState(false);
  const [mineUnread, setMineUnread] = useState(0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`cf-mail-only-mine-${userId}`) === '1';
      mineRef.current = saved;
      setOnlyMineState(saved);
    } catch {
      /* almacenamiento bloqueado: arranca apagado */
    }
  }, [userId]);
  const setOnlyMine = (v: boolean) => {
    mineRef.current = v;
    setOnlyMineState(v);
    setSelectedId(null);
    setDetail(null);
    try {
      localStorage.setItem(`cf-mail-only-mine-${userId}`, v ? '1' : '0');
    } catch {
      /* la preferencia simplemente no persiste */
    }
  };
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
  const [leadDrawerId, setLeadDrawerId] = useState<string | null>(null);
  const [composerTab, setComposerTab] = useState<'reply' | 'note'>('reply');
  const [loadingList, setLoadingList] = useState(true);
  const [unreadByConn, setUnreadByConn] = useState<Record<string, number>>({});
  const msgScrollRef = useRef<HTMLDivElement>(null);
  const fb = useFeedback();
  const [modal, setModal] = useState<
    { mode: ComposerMode; initial?: ComposerInitial; forwardMessageId?: string } | null
  >(null);

  const currentConn = connections.find((c) => c.id === connectionId);
  const selfAddress = (currentConn?.fromAddress ?? '').toLowerCase();
  const sigHtml = signatureHtml(currentConn?.signature);
  // Private mailbox = only mine → no assignment UI (no team to hand off to).
  const isPrivate = currentConn?.visibility === 'PRIVATE';
  const nameOf = (userId: string | null): string =>
    userId ? team.find((m) => m.id === userId)?.name ?? 'Asignado' : '';

  /**
   * Human label for an address in a header: the CRM contact's name, "yo" for the
   * mailbox itself, else nothing (the raw address is shown).
   */
  const labelFor: AddressLabeller = useCallback(
    (address: string) => {
      const a = address.trim().toLowerCase();
      if (a === selfAddress) return currentConn?.displayName || 'este buzón';
      const other = connections.find((c) => c.fromAddress.toLowerCase() === a);
      if (other) return other.displayName || 'otro buzón del equipo';
      // ONLY the address the contact was resolved from. Matching any thread
      // participant labelled every Cc with the same CRM name — the header
      // claimed compras@acme.test was "Ana Ruiz".
      const contactAddress = (detail?.thread.participants ?? [])[0]?.toLowerCase();
      if (detail?.contact && contactAddress && contactAddress === a) return detail.contact.name;
      return null;
    },
    [selfAddress, currentConn, connections, detail],
  );

  /**
   * Load the first page of a folder.
   *
   * The 15s poller calls this too, so it MERGES instead of replacing: a plain
   * `setThreads(items)` threw away every extra page the user had loaded with
   * "Cargar más" — the list snapped back to 40 rows a few seconds later. Fresh
   * items win and come first (a thread with new mail moves to the top and its
   * stale copy in the tail is dropped); older loaded pages are kept below.
   */
  const loadThreads = useCallback(async (conn: string, f: string) => {
    if (!conn) return;
    try {
      const [t, c] = await Promise.all([
        apiFetch<ThreadPage>(`/mail/connections/${conn}/threads?folder=${f}${mineRef.current ? '&mine=1' : ''}`),
        apiFetch<Record<string, number>>(`/mail/connections/${conn}/folder-counts`).catch(() => ({})),
      ]);
      setThreads((prev) => {
        if (!pagedRef.current) return t.items;
        const fresh = new Set(t.items.map((x) => x.id));
        return [...t.items, ...prev.filter((x) => !fresh.has(x.id))];
      });
      // Once paginated, the meaningful cursor is the last page's, not page 1's.
      if (!pagedRef.current) setNextCursor(t.nextCursor);
      setCounts(c);
    } catch {
      /* keep last */
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (searching) return; // pause folder polling while searching
    pagedRef.current = false; // new scope → back to a single page
    void loadThreads(connectionId, folder);
    const t = setInterval(() => void loadThreads(connectionId, folder), 15000);
    return () => clearInterval(t);
  }, [connectionId, folder, loadThreads, searching]);

  /** Append the next page (keyset cursor) for the current folder or search. */
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const base = searching
        ? `/mail/connections/${connectionId}/search?q=${encodeURIComponent(query.trim())}`
        : `/mail/connections/${connectionId}/threads?folder=${folder}`;
      const r = await apiFetch<ThreadPage>(`${base}&cursor=${encodeURIComponent(nextCursor)}`);
      // De-dupe by id: a thread can jump pages if new mail lands mid-scroll.
      setThreads((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...r.items.filter((x) => !seen.has(x.id))];
      });
      setNextCursor(r.nextCursor);
      pagedRef.current = true;
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, searching, connectionId, query, folder]);

  // Team list (assignee picker + name resolution), loaded once.
  useEffect(() => {
    apiFetch<TeamMember[]>('/mail/team').then(setTeam).catch(() => {});
  }, []);

  // Enlace profundo: abre el hilo pedido una sola vez al montar.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !initialThreadId) return;
    deepLinkDone.current = true;
    void openThread(initialThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialThreadId]);

  // Cambiar el filtro «míos» recarga la primera página con el scope nuevo.
  useEffect(() => {
    if (!searching) {
      pagedRef.current = false;
      void loadThreads(connectionId, folder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyMine]);

  // Contador «míos sin leer», junto al resto de sondeos lentos.
  useEffect(() => {
    if (!connectionId || isPrivate) return;
    const poll = () =>
      apiFetch<{ assigned: number; unread: number }>(`/mail/connections/${connectionId}/mine-counts`)
        .then((r) => setMineUnread(r.unread))
        .catch(() => {});
    void poll();
    const timer = setInterval(poll, 20000);
    return () => clearInterval(timer);
  }, [connectionId, isPrivate]);

  // Unread per mailbox → flag other mailboxes with pending mail.
  useEffect(() => {
    const poll = () =>
      apiFetch<Record<string, number>>('/mail/unread-by-connection').then(setUnreadByConn).catch(() => {});
    void poll();
    const t = setInterval(poll, 20000);
    return () => clearInterval(t);
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
        const r = await apiFetch<ThreadPage>(
          `/mail/connections/${connectionId}/search?q=${encodeURIComponent(query.trim())}`,
        );
        pagedRef.current = false;
        setThreads(r.items);
        setNextCursor(r.nextCursor);
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

  /** Último mensaje entrante real del hilo (los borradores no cuentan). */
  function lastInboundOf(d: Detail): Msg | undefined {
    return [...d.messages].reverse().find((m) => m.direction === 'IN' && !m.isDraft);
  }
  function computeDefaultTo(d: Detail): string {
    const lastIn = lastInboundOf(d);
    // Reply-To manda sobre From cuando el remitente lo pidió.
    if (lastIn) return lastIn.replyTo || lastIn.fromAddress || '';
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

  /**
   * Responder a todos = remitente + to/cc del ÚLTIMO ENTRANTE, menos nuestras
   * direcciones, sin duplicados. Antes se construía desde thread.participants,
   * que en hilos iniciados por un correo entrante solo contenía al remitente —
   * por eso los CC desaparecían. La lógica vive en @converflow/shared
   * (buildReplyAllRecipients) y la comparte el servidor.
   */
  function replyAll() {
    if (!detail) return;
    const lastIn = lastInboundOf(detail);
    const { to, cc } = buildReplyAllRecipients(
      lastIn ?? { fromAddress: null, toAddresses: detail.thread.participants, ccAddresses: [] },
      [selfAddress],
    );
    setReplyInit((prev) => ({ ...prev, to: to || prev.to, cc: cc.join(', ') }));
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

  async function saveLead() {
    if (!detail) return;
    try {
      const r = await apiFetch<{ contact: ContactInfo }>(`/mail/threads/${detail.thread.id}/save-lead`, { method: 'POST' });
      setDetail((d) => (d ? { ...d, contact: r.contact } : d));
      fb.toast.success('Contacto guardado como lead');
    } catch {
      fb.toast.error('No se pudo guardar el contacto');
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
      <div className="border-b border-ink-100 p-2">
        <InboxSwitch active="mail" mailCount={mailUnread} imCount={imPending} />
      </div>
      {connections.length > 1 ? (
        <div className="space-y-0.5 border-b border-ink-100 p-1.5">
          {connections.map((c) => {
            const n = unreadByConn[c.id] ?? 0;
            const on = c.id === connectionId;
            return (
              <button
                key={c.id}
                onClick={() => switchMailbox(c.id)}
                title={c.fromAddress}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs ${on ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'}`}
              >
                <span className="truncate">{c.fromAddress}</span>
                {n > 0 && (
                  <span className={`shrink-0 rounded-full px-1.5 text-[10px] font-semibold ${on ? 'bg-white/20 text-white' : 'bg-primary-600 text-white'}`}>
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="truncate border-b border-ink-100 px-2 py-1 text-[11px] text-ink-500" title={connections[0]?.fromAddress}>
          {connections[0]?.fromAddress}
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
    <MailThreadList
      threads={threads}
      selectedId={selectedId}
      onSelect={(id) => void openThread(id)}
      query={query}
      onQuery={(v) => {
        setQuery(v);
        setSelectedId(null);
        setDetail(null);
      }}
      searching={searching}
      loading={loadingList}
      isPrivate={isPrivate}
      nameOf={nameOf}
      nextCursor={nextCursor}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
      onNewMail={() => setModal({ mode: 'new', initial: { html: sigHtml } })}
      onlyMine={onlyMine}
      onOnlyMine={setOnlyMine}
      mineUnread={mineUnread}
    />
  );

  // ---- column: thread ----
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
        {!isPrivate && (
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
        )}
        {(MOVES[folder] ?? []).map((m) => (
          <button key={m.folder} disabled={busy} onClick={() => void move(m.folder)} className={buttonClass('ghost', 'px-1.5 py-0.5 text-xs')}>{m.label}</button>
        ))}
        <button onClick={() => void markUnread()} className={buttonClass('ghost', 'px-1.5 py-0.5 text-xs')}>No leído</button>
        <Link
          href={`/app/tasks/new?title=${encodeURIComponent(detail.thread.subject ?? '')}`}
          className={buttonClass('ghost', 'px-2 py-0.5 text-xs')}
        >
          + Tarea
        </Link>
        {detail.thread.status === 'CLOSED' ? (
          <button type="button" onClick={() => void setStatus('OPEN')} className={buttonClass('secondary', 'px-3 py-1 text-xs')}>
            Reabrir
          </button>
        ) : (
          <button type="button" onClick={() => void setStatus('CLOSED')} className={buttonClass('primary', 'px-3 py-1 text-xs')}>
            Cerrar
          </button>
        )}
      </div>

      {lock && !lock.byMe && (
        <div className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          <AlertTriangle size={13} /> {lock.byName} está respondiendo a este hilo ahora mismo.
        </div>
      )}

      <MailAiPanel threadId={detail.thread.id} messageCount={visibleMessages.length} />

      <div ref={msgScrollRef} className="flex-1 overflow-y-auto bg-ink-100/20 p-3 md:p-4">
        <ThreadMessages
          messages={visibleMessages}
          mailboxAddress={currentConn?.fromAddress ?? ''}
          currentUserId={userId}
          labelFor={labelFor}
          onForward={(m) =>
            setModal({
              mode: 'forward',
              forwardMessageId: m.id,
              initial: { subject: fwdSubject(m.subject || detail.thread.subject), html: sigHtml },
            })
          }
          onDownloadAttachment={(a) => void downloadAttachment(a.id)}
        />
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
                  onClick={() => setModal({ mode: 'forward', forwardMessageId: lastMessageId, initial: { subject: fwdSubject(detail.thread.subject), html: sigHtml } })}
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
        {
          label: 'CRM',
          value: detail.contact ? (
            detail.contact.type === 'client' ? (
              <Link href={`/app/clients/${detail.contact.id}`} className="text-primary-700 hover:underline">
                Ver perfil (cliente) →
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setLeadDrawerId(detail.contact!.id)}
                className="text-primary-700 hover:underline"
              >
                Ver ficha (lead) →
              </button>
            )
          ) : (
            <button type="button" onClick={() => void saveLead()} className={buttonClass('secondary', 'text-xs')}>
              Guardar como lead
            </button>
          ),
        },
        ...(isPrivate
          ? []
          : [{ label: 'Asignado a', value: detail.thread.assigneeUserId ? nameOf(detail.thread.assigneeUserId) : 'Sin asignar' }]),
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

      {leadDrawerId && <LeadDrawer leadId={leadDrawerId} onClose={() => setLeadDrawerId(null)} />}

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
