'use client';

import { useState, useTransition } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Textarea, buttonClass } from '@/components/ui/primitives';

interface TestResponse {
  reply: string;
  model: string;
  costUsd: number;
  durationMs: number;
}

export function AgentPlayground({ agentId }: { agentId: string }) {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
        <span className="mr-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[9px] tracking-wider text-amber-900">
          IA
        </span>
        Probar agente
      </h2>
      <p className="mt-1 text-xs text-ink-500">
        Escribe un mensaje como si fueras un cliente y mira cómo respondería el agente con su
        prompt + conocimiento actuales. La respuesta la genera un asistente de IA y puede
        contener errores. (Guarda los cambios antes de probar.)
      </p>
      <div className="mt-4 space-y-3">
        <Textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hola, ¿cuánto cuesta el plan básico?"
        />
        <button
          type="button"
          disabled={pending || !message.trim()}
          className={buttonClass('primary')}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                setResult(
                  await apiFetch<TestResponse>(`/agents/${agentId}/test`, {
                    method: 'POST',
                    json: { message: message.trim() },
                  }),
                );
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Error inesperado');
              }
            });
          }}
        >
          {pending ? 'Probando…' : 'Probar'}
        </button>

        {result && (
          <div className="rounded-md border border-ink-200 bg-ink-100/40 p-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ink-500">
              <span>Respuesta del agente</span>
              <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                Generado por IA
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{result.reply}</p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Card>
  );
}
