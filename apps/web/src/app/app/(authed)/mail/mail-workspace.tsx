'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';
import { RichEmailEditor } from '@/components/ui/rich-email-editor';

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
}
interface Msg {
  id: string;
  direction: 'IN' | 'OUT';
  fromAddress: string | null;
  fromName: string | null;
  subject: string | null;
  html: string | null;
  text: string | null;
  receivedAt: string | null;
  createdAt: string;
  attachments: { id: string; filename: string }[];
}
interface Detail {
  thread: { id: string; subject: string | null; folder: string };
  messages: Msg[];
}

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

export function MailWorkspace({ connections }: { connections: MailboxOption[] }) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [folder, setFolder] = useState('INBOX');
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [replyHtml, setReplyHtml] = useState('');
  const [replyKey, setReplyKey] = useState(0);
  const [replyError, setReplyError] = useState<string | null>(null);

  const loadThreads = useCallback(
    async (conn: string, f: string) => {
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
    },
    [],
  );

  useEffect(() => {
    void loadThreads(connectionId, folder);
    const t = setInterval(() => void loadThreads(connectionId, folder), 15000);
    return () => clearInterval(t);
  }, [connectionId, folder, loadThreads]);

  function resetReply() {
    setReplyHtml('');
    setReplyError(null);
    setReplyKey((k) => k + 1);
  }

  function switchMailbox(id: string) {
    setConnectionId(id);
    setFolder('INBOX');
    setSelectedId(null);
    setDetail(null);
    resetReply();
  }

  async function sendReply() {
    if (!selectedId || !replyHtml.replace(/<[^>]*>/g, '').trim()) return;
    setBusy(true);
    setReplyError(null);
    try {
      await apiFetch(`/mail/threads/${selectedId}/reply`, { method: 'POST', json: { html: replyHtml } });
      resetReply();
      const d = await apiFetch<Detail>(`/mail/threads/${selectedId}`);
      setDetail(d);
      void loadThreads(connectionId, folder);
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  }

  async function openThread(id: string) {
    setSelectedId(id);
    setDetail(null);
    resetReply();
    try {
      const d = await apiFetch<Detail>(`/mail/threads/${id}`);
      setDetail(d);
      await apiFetch(`/mail/threads/${id}/read`, { method: 'POST' }).catch(() => {});
      void loadThreads(connectionId, folder);
    } catch {
      /* ignore */
    }
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

  async function markUnread() {
    if (!selectedId) return;
    await apiFetch(`/mail/threads/${selectedId}/unread`, { method: 'POST' }).catch(() => {});
    setSelectedId(null);
    setDetail(null);
    void loadThreads(connectionId, folder);
  }

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
            onClick={() => { setFolder(f.key); setSelectedId(null); setDetail(null); }}
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
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-ink-500">
              {folder === 'SENT' || folder === 'DRAFTS' ? 'Disponible al activar redacción (2.3).' : 'Sin mensajes en esta carpeta.'}
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
                <div className="truncate text-xs text-ink-400">{t.snippet}</div>
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
            <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
              <h2 className="truncate text-base font-semibold">{detail.thread.subject || '(sin asunto)'}</h2>
              <div className="flex shrink-0 gap-1">
                {(MOVES[folder] ?? []).map((m) => (
                  <button key={m.folder} disabled={busy} onClick={() => void move(m.folder)} className={buttonClass('secondary', 'px-2 py-1 text-xs')}>{m.label}</button>
                ))}
                <button onClick={() => void markUnread()} className={buttonClass('ghost', 'px-2 py-1 text-xs')}>No leído</button>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-ink-100/20 p-4">
              {detail.messages.map((m) => (
                <div key={m.id} className="rounded-lg border border-ink-100 bg-white p-3">
                  <div className="mb-2 flex items-baseline justify-between text-xs text-ink-500">
                    <span className="font-medium text-ink-700">{m.fromName || m.fromAddress || (m.direction === 'OUT' ? 'Tú' : 'Contacto')}</span>
                    <span>{fmt(m.receivedAt || m.createdAt)}</span>
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
                        <span key={a.id} className="rounded bg-ink-100 px-2 py-0.5">📎 {a.filename}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-ink-100 bg-white p-3">
              <RichEmailEditor key={replyKey} onChange={setReplyHtml} />
              {replyError && <p className="text-xs text-red-600">{replyError}</p>}
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy || !replyHtml.replace(/<[^>]*>/g, '').trim()}
                  onClick={() => void sendReply()}
                  className={buttonClass('primary')}
                >
                  {busy ? 'Enviando…' : 'Responder'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
