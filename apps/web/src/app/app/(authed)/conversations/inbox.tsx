'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Badge, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';
import { MeetingScheduler } from '@/components/meeting-scheduler';
import { ChannelBadge } from '@/components/ui/channel-badge';
import { RichEmailEditor } from '@/components/ui/rich-email-editor';
import { TemplatePicker } from '@/components/ui/template-picker';
import { ComposeEmailModal } from './compose-email-modal';

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
const textToHtml = (s: string) => `<p>${escapeHtml(s).replace(/\n/g, '<br>')}</p>`;

interface ConvRow {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  contactJid: string;
  channel: string;
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
  bodyHtml: string | null;
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
  channel: string;
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
  const [composeHtml, setComposeHtml] = useState('');
  const [composeInitialHtml, setComposeInitialHtml] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [emailAttachments, setEmailAttachments] = useState<{ id: string; name: string }[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [docs, setDocs] = useState<{ id: string; name: string }[] | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [showActions, setShowActions] = useState(false);

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
    const t = setInterval(() => void loadList(status), 10000);
    return () => clearInterval(t);
  }, [status, loadList]);

  // Poll the open thread.
  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      return;
    }
    const t = setInterval(() => void loadThread(selectedId), 8000);
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

  async function sendEmail(html: string) {
    if (!thread) return;
    const h = html.trim();
    const hasText = !!h && h !== '<p></p>';
    if (!hasText && emailAttachments.length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      await apiFetch(`/conversations/${thread.id}/send`, {
        method: 'POST',
        json: { html: h, documentIds: emailAttachments.map((a) => a.id) },
      });
      setComposeHtml('');
      setComposeInitialHtml('');
      setEmailAttachments([]);
      setShowDocs(false);
      setEditorKey((k) => k + 1); // remount editor → clears it
      await Promise.all([loadList(status), loadThread(thread.id)]);
    } catch {
      setSendError('No se pudo enviar el email.');
    } finally {
      setSending(false);
    }
  }

  function addAttachment(d: { id: string; name: string }) {
    setEmailAttachments((prev) => (prev.some((a) => a.id === d.id) ? prev : [...prev, d]));
    setShowDocs(false);
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
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <ChannelBadge channel={c.channel} size={12} />
                    <span className="truncate text-sm font-medium text-ink-900">{contactTitle(c)}</span>
                  </span>
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
                <div className="flex items-center gap-2">
                  <ChannelBadge channel={thread.channel} size={14} showLabel />
                </div>
                <div className="mt-1 truncate font-medium text-ink-900">{contactTitle(thread)}</div>
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
                {thread.lead && (
                  <button
                    type="button"
                    className={buttonClass(showActions ? 'secondary' : 'ghost')}
                    onClick={() => setShowActions((v) => !v)}
                  >
                    ⚡ Acciones
                  </button>
                )}
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

            {showActions && thread.lead && (
              <div className="space-y-3 border-b border-ink-100 bg-ink-100/20 px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/app/tasks/new?leadId=${thread.lead.id}`}
                    className={buttonClass('secondary')}
                  >
                    + Tarea
                  </Link>
                  <Link
                    href={`/app/opportunities/new?leadId=${thread.lead.id}`}
                    className={buttonClass('secondary')}
                  >
                    + Oportunidad
                  </Link>
                </div>
                <div className="rounded-md border border-ink-100 bg-white p-3">
                  <div className="mb-2 text-xs font-mono uppercase tracking-wider text-ink-500">
                    Reunión IA
                  </div>
                  <MeetingScheduler leadId={thread.lead.id} />
                </div>
              </div>
            )}

            <div className="flex-1 space-y-2 overflow-y-auto bg-ink-100/20 p-4">
              <div
                role="note"
                aria-label="Aviso de uso de IA"
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
              >
                <strong>Aviso IA.</strong> Algunas respuestas de este chat pueden
                generarse automáticamente con un asistente de IA. Las marcadas
                con la etiqueta IA están generadas por el modelo.
              </div>
              {thread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      m.direction === 'OUT' ? 'bg-primary-100 text-ink-900' : 'border border-ink-100 bg-white text-ink-900'
                    }`}
                  >
                    {m.mediaType && <div className="mb-1 text-xs italic text-ink-500">[{m.mediaType}]</div>}
                    {m.bodyHtml ? (
                      <div
                        className="text-sm [&_a]:text-primary-700 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-ink-200 [&_blockquote]:pl-3 [&_p]:my-1 [&_img]:max-w-full"
                        // Server-sanitized (sanitize-html) before storage.
                        dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
                      />
                    ) : (
                      m.body && <p className="whitespace-pre-wrap">{m.body}</p>
                    )}
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
                        onClick={() =>
                          thread.channel === 'EMAIL' ? addAttachment(d) : void sendDoc(d.id)
                        }
                        className="block w-full truncate p-2 text-left text-sm hover:bg-ink-100"
                      >
                        📎 {d.name}
                      </button>
                    ))
                  )}
                </div>
              )}

              {thread.channel === 'EMAIL' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => void toggleDocs()}
                      disabled={sending}
                      className="rounded-md border border-ink-300 px-2 py-1 text-xs hover:bg-ink-100"
                    >
                      📎 Adjuntar
                    </button>
                    <TemplatePicker
                      onPick={(t) => {
                        setComposeInitialHtml(t.bodyHtml);
                        setComposeHtml(t.bodyHtml);
                        setEditorKey((k) => k + 1);
                      }}
                    />
                  </div>
                  <RichEmailEditor
                    key={editorKey}
                    initialHtml={composeInitialHtml}
                    onChange={setComposeHtml}
                  />
                  {emailAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {emailAttachments.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-700"
                        >
                          📎 {a.name}
                          <button
                            type="button"
                            onClick={() =>
                              setEmailAttachments((prev) => prev.filter((x) => x.id !== a.id))
                            }
                            className="text-ink-400 hover:text-red-600"
                            aria-label="Quitar adjunto"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={
                        sending ||
                        (!composeHtml.replace(/<[^>]*>/g, '').trim() && emailAttachments.length === 0)
                      }
                      className={buttonClass('primary')}
                      onClick={() => void sendEmail(composeHtml)}
                    >
                      {sending ? 'Enviando…' : 'Enviar correo'}
                    </button>
                  </div>
                </div>
              ) : (
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
              )}
              {sendError && <p className="text-xs text-red-600">{sendError}</p>}

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
                      onClick={() => {
                        const s = lastSuggestion.aiSuggestedReply ?? '';
                        if (thread.channel === 'EMAIL') void sendEmail(textToHtml(s));
                        else void sendMessage(s);
                      }}
                    >
                      Enviar
                    </button>
                    <button
                      type="button"
                      className={buttonClass('ghost')}
                      onClick={() => {
                        const s = lastSuggestion.aiSuggestedReply ?? '';
                        if (thread.channel === 'EMAIL') {
                          setComposeInitialHtml(textToHtml(s));
                          setEditorKey((k) => k + 1);
                        } else {
                          setComposeText(s);
                        }
                      }}
                    >
                      Editar
                    </button>
                    <CopyButton value={lastSuggestion.aiSuggestedReply} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showCompose && (
        <ComposeEmailModal
          onClose={() => setShowCompose(false)}
          onSent={(id) => {
            setShowCompose(false);
            void loadList(status);
            selectConversation(id);
          }}
        />
      )}
    </div>
  );
}
