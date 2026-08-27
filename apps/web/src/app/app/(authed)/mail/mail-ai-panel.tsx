'use client';

/**
 * Thread summary panel.
 *
 * Deliberately NOT auto-generated on open: the summary costs a model call, and
 * the thread is re-fetched every 12s by the poller. The user asks for it, and
 * from then on the cached one is served for free until the thread grows.
 */

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { aiErrorMessage } from './ai-error';
import type { ThreadState, ThreadSummary } from './mail-types';

const STATE_LABEL: Record<ThreadState, string> = {
  WAITING_US: 'Te toca contestar',
  WAITING_THEM: 'Esperando su respuesta',
  BLOCKED: 'Bloqueado',
  CLOSED: 'Cerrado',
};

const STATE_STYLE: Record<ThreadState, string> = {
  WAITING_US: 'bg-amber-100 text-amber-800',
  WAITING_THEM: 'bg-sky-100 text-sky-800',
  BLOCKED: 'bg-red-100 text-red-700',
  CLOSED: 'bg-ink-200 text-ink-600',
};

interface SummaryResponse {
  summary: ThreadSummary;
  cached: boolean;
  at: string;
}

export function MailAiPanel({ threadId, messageCount }: { threadId: string; messageCount: number }) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  // A new message invalidates what we are showing: drop it so the user isn't
  // reading a summary that predates the latest reply.
  useEffect(() => {
    setData(null);
    setError(null);
  }, [threadId, messageCount]);

  const run = useCallback(
    async (force: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const r = await apiFetch<SummaryResponse>(`/mail/threads/${threadId}/ai/summary`, {
          method: 'POST',
          json: { force },
        });
        setData(r);
        setOpen(true);
      } catch (err) {
        setError(aiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [threadId],
  );

  if (!data && !loading && !error) {
    return (
      <div className="border-b border-ink-100 px-3 py-2 md:px-4">
        <button
          type="button"
          onClick={() => void run(false)}
          className="inline-flex items-center gap-1.5 text-xs text-primary-700 hover:underline"
        >
          <Sparkles size={13} /> Resumir este hilo con IA
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-ink-100 bg-primary-50/40 px-3 py-2 md:px-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-900"
          aria-expanded={open}
        >
          <Sparkles size={13} /> Resumen IA
          {data?.summary.state && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${STATE_STYLE[data.summary.state]}`}>
              {STATE_LABEL[data.summary.state]}
            </span>
          )}
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {data && (
          <button
            type="button"
            onClick={() => void run(true)}
            disabled={loading}
            title="Volver a generar"
            className="inline-flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-800 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Regenerar
          </button>
        )}
      </div>

      {loading && !data && <p className="mt-1.5 text-xs text-ink-500">Leyendo el hilo…</p>}

      {error && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-red-700">
          <AlertTriangle size={12} /> {error}
        </p>
      )}

      {open && data && (
        <div className="mt-2 space-y-2 text-xs">
          <ul className="list-disc space-y-0.5 pl-4 text-ink-700">
            {data.summary.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>

          {data.summary.asks.length > 0 && (
            <div>
              <span className="font-medium text-ink-800">Te piden:</span>
              <ul className="list-disc space-y-0.5 pl-4 text-ink-700">
                {data.summary.asks.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {data.summary.nextStep && (
            <p className="text-ink-700">
              <span className="font-medium text-ink-800">Siguiente paso:</span> {data.summary.nextStep}
            </p>
          )}

          <p className="text-[10px] text-ink-400">
            Generado por IA a partir del hilo · revisa antes de actuar
            {data.cached ? ' · en caché' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
