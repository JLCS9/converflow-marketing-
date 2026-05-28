'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';

interface ScoreResponse {
  ai: {
    score: number;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    reasoning: string;
    recommendedActions: string[];
    model: string;
    durationMs: number;
    costUsd: number;
  };
}

export function ScoreLeadButton({
  leadId,
  hasScore,
}: {
  leadId: string;
  hasScore: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastCost, setLastCost] = useState<{ cost: number; ms: number; model: string } | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass(hasScore ? 'secondary' : 'primary')}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await apiFetch<ScoreResponse>(`/leads/${leadId}/score`, {
                method: 'POST',
              });
              setLastCost({
                cost: res.ai.costUsd,
                ms: res.ai.durationMs,
                model: res.ai.model,
              });
              router.refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        {pending
          ? 'Analizando con Claude…'
          : hasScore
            ? '↻ Recalcular score'
            : '✨ Calcular score con IA'}
      </button>
      {lastCost && <p className="text-xs text-ink-500">✓ Score actualizado con IA.</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
