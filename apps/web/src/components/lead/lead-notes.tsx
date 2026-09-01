'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Send, Sparkles, Trash2 } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Badge, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';
import { useFeedback } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/inbox-kit';
import { useSession } from '@/lib/session-context';

export interface LeadNote {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  aiCategory: string | null;
  aiSentiment: string | null;
  aiConfidence: number | null;
  aiSuggestedReply: string | null;
  aiAnalyzedAt: string | null;
}

const categoryColor: Record<string, 'gray' | 'green' | 'yellow' | 'red' | 'blue'> = {
  BUY_INTENT: 'green',
  OBJECTION: 'yellow',
  INFO_REQUEST: 'blue',
  COMPLAINT: 'red',
  SCHEDULING: 'blue',
  OFF_TOPIC: 'gray',
  OTHER: 'gray',
};

const categoryLabel: Record<string, string> = {
  BUY_INTENT: 'Intención de compra',
  OBJECTION: 'Objeción',
  INFO_REQUEST: 'Pide info',
  COMPLAINT: 'Queja',
  SCHEDULING: 'Agendar',
  OFF_TOPIC: 'Off-topic',
  OTHER: 'Otro',
};

const sentimentEmoji: Record<string, string> = {
  POSITIVE: '😊',
  NEUTRAL: '😐',
  NEGATIVE: '😟',
  URGENT: '🚨',
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Comentarios del lead en formato conversación (burbujas): los propios a la
 * derecha, los del resto del equipo a la izquierda con avatar y nombre.
 * La clasificación IA existente de cada nota se conserva dentro de la burbuja.
 */
export function LeadNotes({
  leadId,
  notes,
  onChanged,
}: {
  leadId: string;
  notes: LeadNote[];
  onChanged: () => void;
}) {
  const session = useSession();
  const t = useTranslations('leadCard');
  const { confirm, toast } = useFeedback();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);

  // Estilo chat: más antiguas arriba, más recientes junto al input.
  const ordered = [...notes].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  function submit() {
    const body = draft.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await apiFetch('/notes', { method: 'POST', json: { body, leadId } });
        setDraft('');
        onChanged();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error');
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {ordered.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">
            {t('noComments')}
          </p>
        ) : (
          ordered.map((note) => {
            const mine = note.authorId === session.userId;
            const author = note.authorName ?? 'Usuario';
            return (
              <div key={note.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && (
                  <div className="mt-0.5 shrink-0">
                    <Avatar name={author} size="sm" />
                  </div>
                )}
                <div
                  className={`group relative max-w-[85%] rounded-2xl border px-3 py-2 text-sm shadow-sm ${
                    mine
                      ? 'rounded-br-sm border-primary-100 bg-primary-50 text-ink-900'
                      : 'rounded-bl-sm border-ink-100 bg-white text-ink-900'
                  }`}
                >
                  {!mine && (
                    <div className="mb-0.5 text-[11px] font-semibold text-primary-700">{author}</div>
                  )}
                  <p className="whitespace-pre-wrap break-words">{note.body}</p>

                  {note.aiCategory && (
                    <div className="mt-2 space-y-1.5 rounded-lg bg-ink-100/50 p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge color={categoryColor[note.aiCategory] ?? 'gray'}>
                          {categoryLabel[note.aiCategory] ?? note.aiCategory}
                        </Badge>
                        {note.aiSentiment && (
                          <span className="font-mono">{sentimentEmoji[note.aiSentiment] ?? ''}</span>
                        )}
                        {note.aiConfidence != null && (
                          <span className="text-ink-500">{Math.round(note.aiConfidence * 100)}%</span>
                        )}
                      </div>
                      {note.aiSuggestedReply && (
                        <div className="flex items-start gap-1.5">
                          <span className="flex-1 whitespace-pre-wrap break-words text-ink-700">
                            {note.aiSuggestedReply}
                          </span>
                          <CopyButton value={note.aiSuggestedReply} />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-ink-400">
                    {!note.aiCategory && (
                      <button
                        type="button"
                        disabled={pendingNoteId === note.id}
                        onClick={() => {
                          setPendingNoteId(note.id);
                          setError(null);
                          startTransition(async () => {
                            try {
                              await apiFetch(`/notes/${note.id}/analyze`, { method: 'POST' });
                              onChanged();
                            } catch (err) {
                              setError(err instanceof ApiError ? err.message : 'Error');
                            } finally {
                              setPendingNoteId(null);
                            }
                          });
                        }}
                        className="inline-flex items-center gap-0.5 text-primary-700 opacity-0 transition-opacity hover:underline disabled:opacity-60 group-hover:opacity-100"
                      >
                        <Sparkles size={10} />
                        {pendingNoteId === note.id ? t('analyzing') : t('analyzeAi')}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={t('deleteComment')}
                      disabled={pendingNoteId === note.id}
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('deleteComment'),
                          confirmLabel: 'Eliminar',
                          danger: true,
                        });
                        if (!ok) return;
                        setPendingNoteId(note.id);
                        startTransition(async () => {
                          try {
                            await apiFetch(`/notes/${note.id}`, { method: 'DELETE' });
                            toast.success(t('commentDeleted'));
                            onChanged();
                          } catch (err) {
                            toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar');
                          } finally {
                            setPendingNoteId(null);
                          }
                        });
                      }}
                      className="text-ink-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                    <span>{timeLabel(note.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={t('commentPlaceholder')}
          className="min-h-[2.5rem] flex-1 resize-y rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className={buttonClass('primary', 'px-3 py-2')}
          aria-label={t('sendComment')}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
