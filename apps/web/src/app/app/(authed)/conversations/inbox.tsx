'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Badge, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';

interface ConvRow {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  contactJid: string;
  status: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  lead: { id: string; name: string; score: number | null } | null;
}

interface ThreadMsg {
  id: string;
  direction: 'IN' | 'OUT';
  body: string | null;
  mediaType: string | null;
  aiCategory: string | null;
  aiSentiment: string | null;
  aiSuggestedReply: string | null;
  createdAt: string;
}

interface Thread {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  contactJid: string;
  status: string;
  lead: { id: string; name: string; score: number | null; status: string; company: string | null } | null;
  messages: ThreadMsg[];
}

const TABS: { key: string; label: string }[] = [
  { key: 'PENDING', label: 'Sin responder' },
  { key: '', label: 'Todas' },
  { key: 'CLOSED', label: 'Cerradas' },
];

const categoryLabel: Record<string, string> = {
  BUY_INTENT: 'Intención de compra',
  OBJECTION: 'Objeción',
  INFO_REQUEST: 'Pide info',
  COMPLAINT: 'Queja',
  SCHEDULING: 'Agendar',
  OFF_TOPIC: 'Off-topic',
  OTHER: 'Otro',
};
const categoryColor: Record<string, 'gray' | 'green' | 'yellow' | 'red' | 'blue'> = {
  BUY_INTENT: 'green',
  OBJECTION: 'yellow',
  INFO_REQUEST: 'blue',
  COMPLAINT: 'red',
  SCHEDULING: 'blue',
  OFF_TOPIC: 'gray',
  OTHER: 'gray',
};

function timeLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function contactTitle(c: { contactName: string | null; contactPhone: string | null; contactJid: string }): string {
  return c.contactName || c.contactPhone || c.contactJid.split('@')[0] || 'Contacto';
}

export function Inbox({ initial }: { initial: ConvRow[] }) {
  const [status, setStatus] = useState('PENDING');
  const [convs, setConvs] = useState<ConvRow[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [busy, setBusy] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [docs, setDocs] = useState<{ id: string; name: string }[] | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  const loadList = useCallback(async (st: string) => {
    try {
      const data = await apiFetch<ConvRow[]>(`/conversations${st ? `?status=${st}` : ''}`);
      setConvs(data);
    } catch {
      /* keep last */
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      setThread(await apiFetch<Thread>(`/conversations/${id}`));
    } catch {
      /* keep last */
    }
  }, []);

  function selectConversation(id: string) {
    setSelectedId(id);
    void loadThread(id);
    void apiFetch(`/conversations/${id}/read`, { method: 'POST' })
      .then(() => loadList(status))
      .catch(() => {});
  }

  // Refetch list on filter change + poll.
  useEffect(() => {
    void loadList(status);
    const t = setInterval(() => void loadList(status), 4000);
    return () => clearInterval(t);
  }, [status, loadList]);

  // Poll the open thread.
  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      return;
    }
    const t = setInterval(() => void loadThread(selectedId), 4000);
    return () => clearInterval(t);
  }, [selectedId, loadThread]);

  async function setConvStatus(id: string, action: 'close' | 'reopen') {
    setBusy(true);
    try {
      await apiFetch(`/conversations/${id}/${action}`, { method: 'POST' });
      await Promise.all([loadList(status), loadThread(id)]);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(text: string) {
    if (!thread) return;
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setSendError(null);
    try {
      await apiFetch(`/conversations/${thread.id}/send`, { method: 'POST', json: { text: t } });
      setComposeText('');
      await Promise.all([loadList(status), loadThread(thread.id)]);
    } catch {
      setSendError('No se pudo enviar. ¿El bot sigue conectado?');
    } finally {
      setSending(false);
    }
  }

  async function sendDoc(documentId: string) {
    if (!thread) return;
    setSending(true);
    setSendError(null);
    setShowDocs(false);
    try {
      await apiFetch(`/conversations/${thread.id}/send-document`, {
        method: 'POST',
        json: { documentId },
      });
      await Promise.all([loadList(status), loadThread(thread.id)]);
    } catch {
      setSendError('No se pudo enviar el documento.');
    } finally {
      setSending(false);
    }
  }

  async function toggleDocs() {
    if (!showDocs && docs === null) {
      try {
        setDocs(await apiFetch<{ id: string; name: string }[]>('/documents'));
      } catch {
        setDocs([]);
      }
    }
    setShowDocs((v) => !v);
  }

  const lastSuggestion = thread?.messages
    .filter((m) => m.direction === 'IN' && m.aiSuggestedReply)
    .at(-1);

  return (
    <div className="flex h-[calc(100vh-11rem)] gap-4">
      {/* Left: conversation list */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-ink-100 bg-white">
        <div className="flex gap-1 border-b border-ink-100 p-2 text-xs">
          {TABS.map((t) => (
            <button
              key={t.key || 'all'}
              type="button"
              onClick={() => setStatus(t.key)}
              className={`rounded px-2 py-1 ${status === t.key ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 ? (
            <p className="p-4 text-sm text-ink-500">No hay conversaciones aquí.</p>
          ) : (
            convs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectConversation(c.id)}
                className={`block w-full border-b border-ink-100 p-3 text-left hover:bg-ink-100/40 ${selectedId === c.id ? 'bg-ink-100/60' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink-900">{contactTitle(c)}</span>
                  <span className="shrink-0 text-[10px] text-ink-400">{timeLabel(c.lastMessageAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="flex-1 truncate text-xs text-ink-500">
                    {c.lastMessagePreview ?? ''}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-semibold text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                {c.status === 'PENDING' && (
                  <span className="mt-1 inline-block text-[10px] font-medium text-amber-600">● Sin responder</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: thread */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-ink-100 bg-white">
        {!thread ? (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-500">
            Selecciona una conversación.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink-900">{contactTitle(thread)}</div>
                <div className="text-xs text-ink-500">
                  {thread.contactPhone ?? thread.contactJid}
                  {thread.lead && (
                    <>
                      {' · '}
                      <Link href={`/app/leads/${thread.lead.id}`} className="text-primary-700 hover:underline">
                        Lead: {thread.lead.name}
                        {thread.lead.score != null && ` (${thread.lead.score})`}
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {thread.status === 'CLOSED' ? (
                  <button type="button" disabled={busy} className={buttonClass('secondary')} onClick={() => setConvStatus(thread.id, 'reopen')}>
                    Reabrir
                  </button>
                ) : (
                  <button type="button" disabled={busy} className={buttonClass('ghost')} onClick={() => setConvStatus(thread.id, 'close')}>
                    Cerrar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto bg-ink-100/20 p-4">
              {thread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      m.direction === 'OUT' ? 'bg-primary-100 text-ink-900' : 'border border-ink-100 bg-white text-ink-900'
                    }`}
                  >
                    {m.mediaType && <div className="mb-1 text-xs italic text-ink-500">[{m.mediaType}]</div>}
                    {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-400">
                      <span>{timeLabel(m.createdAt)}</span>
                      {m.aiCategory && (
                        <Badge color={categoryColor[m.aiCategory] ?? 'gray'}>
                          {categoryLabel[m.aiCategory] ?? m.aiCategory}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-ink-100 bg-white p-3">
              {lastSuggestion?.aiSuggestedReply && (
                <div className="rounded-md border border-primary-200 bg-primary-50 p-2 text-sm">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-primary-700">
                    💡 Respuesta sugerida por IA
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-ink-900">
                    {lastSuggestion.aiSuggestedReply}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={sending}
                      className={buttonClass('primary')}
                      onClick={() => void sendMessage(lastSuggestion.aiSuggestedReply ?? '')}
                    >
                      Enviar
                    </button>
                    <button
                      type="button"
                      className={buttonClass('ghost')}
                      onClick={() => setComposeText(lastSuggestion.aiSuggestedReply ?? '')}
                    >
                      Editar
                    </button>
                    <CopyButton value={lastSuggestion.aiSuggestedReply} />
                  </div>
                </div>
              )}

              {showDocs && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-ink-200">
                  {docs === null ? (
                    <p className="p-2 text-xs text-ink-500">Cargando…</p>
                  ) : docs.length === 0 ? (
                    <p className="p-2 text-xs text-ink-500">No tienes documentos subidos.</p>
                  ) : (
                    docs.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => void sendDoc(d.id)}
                        className="block w-full truncate p-2 text-left text-sm hover:bg-ink-100"
                      >
                        📎 {d.name}
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => void toggleDocs()}
                  disabled={sending}
                  title="Adjuntar un documento"
                  className="shrink-0 rounded-md border border-ink-300 px-2 py-2 text-sm hover:bg-ink-100"
                >
                  📎
                </button>
                <textarea
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage(composeText);
                    }
                  }}
                  rows={1}
                  placeholder="Escribe un mensaje… (emojis 🙂, Enter para enviar)"
                  className="flex-1 resize-none rounded-md border-ink-300 text-sm focus:border-primary-500 focus:ring-primary-500"
                />
                <button
                  type="button"
                  disabled={sending || !composeText.trim()}
                  className={buttonClass('primary')}
                  onClick={() => void sendMessage(composeText)}
                >
                  {sending ? '…' : 'Enviar'}
                </button>
              </div>
              {sendError && <p className="text-xs text-red-600">{sendError}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
