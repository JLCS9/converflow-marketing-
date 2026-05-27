'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Badge, Textarea, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';

interface Note {
  id: string;
  body: string;
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

export function NotesSection({ leadId, initial }: { leadId: string; initial: Note[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const body = String(data.get('body') ?? '').trim();
          if (!body) return;
          setError(null);
          startTransition(async () => {
            try {
              await apiFetch('/notes', { method: 'POST', json: { body, leadId } });
              form.reset();
              router.refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error');
            }
          });
        }}
      >
        <Textarea
          name="body"
          rows={3}
          required
          placeholder="Escribe una nota o pega un mensaje recibido del lead…"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-500">
            Tras crearla, podrás clasificarla automáticamente con Claude.
          </p>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Guardando…' : 'Añadir nota'}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {initial.length === 0 ? (
        <p className="text-sm text-ink-500">Sin notas aún.</p>
      ) : (
        <ul className="space-y-3">
          {initial.map((note) => (
            <li key={note.id} className="rounded-lg border border-ink-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="flex-1 whitespace-pre-wrap text-sm text-ink-900">{note.body}</p>
                <span className="shrink-0 text-xs text-ink-500">
                  {new Date(note.createdAt).toLocaleString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {note.aiCategory ? (
                <div className="mt-3 space-y-2 rounded-md bg-ink-100/40 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={categoryColor[note.aiCategory] ?? 'gray'}>
                      {categoryLabel[note.aiCategory] ?? note.aiCategory}
                    </Badge>
                    {note.aiSentiment && (
                      <span className="font-mono">
                        {sentimentEmoji[note.aiSentiment] ?? ''} {note.aiSentiment}
                      </span>
                    )}
                    {note.aiConfidence != null && (
                      <span className="text-ink-500">
                        confianza {Math.round(note.aiConfidence * 100)}%
                      </span>
                    )}
                  </div>
                  {note.aiSuggestedReply && (
                    <div>
                      <div className="font-mono uppercase tracking-wider text-ink-500">
                        Respuesta sugerida
                      </div>
                      <div className="mt-1 flex items-start gap-2">
                        <code className="flex-1 whitespace-pre-wrap rounded border border-ink-200 bg-white px-2 py-1 font-sans text-ink-900">
                          {note.aiSuggestedReply}
                        </code>
                        <CopyButton value={note.aiSuggestedReply} />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={pendingNoteId === note.id}
                    onClick={() => {
                      setPendingNoteId(note.id);
                      setError(null);
                      startTransition(async () => {
                        try {
                          await apiFetch(`/notes/${note.id}/analyze`, { method: 'POST' });
                          router.refresh();
                        } catch (err) {
                          setError(err instanceof ApiError ? err.message : 'Error');
                        } finally {
                          setPendingNoteId(null);
                        }
                      });
                    }}
                    className="text-xs text-primary-700 hover:underline disabled:opacity-60"
                  >
                    {pendingNoteId === note.id ? 'Analizando…' : '✨ Analizar con IA'}
                  </button>
                </div>
              )}

              <div className="mt-2 flex justify-end gap-3 text-xs">
                <button
                  type="button"
                  disabled={pendingNoteId === note.id}
                  onClick={() => {
                    if (!confirm('¿Eliminar esta nota?')) return;
                    setPendingNoteId(note.id);
                    startTransition(async () => {
                      try {
                        await apiFetch(`/notes/${note.id}`, { method: 'DELETE' });
                        router.refresh();
                      } catch (err) {
                        setError(err instanceof ApiError ? err.message : 'Error');
                      } finally {
                        setPendingNoteId(null);
                      }
                    });
                  }}
                  className="text-red-600 hover:underline disabled:opacity-60"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
