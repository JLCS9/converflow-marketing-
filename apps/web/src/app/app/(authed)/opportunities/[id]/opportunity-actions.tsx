'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Field, Input, Select, buttonClass } from '@/components/ui/primitives';

const STATUSES = ['OPEN', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST'] as const;

export function OpportunityActions({
  opportunityId,
  currentStatus,
  currentProbability,
}: {
  opportunityId: string;
  currentStatus: (typeof STATUSES)[number];
  currentProbability: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(currentStatus);
  const [probability, setProbability] = useState<number>(currentProbability);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Probabilidad (%)">
          <Input
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(Number(e.target.value))}
          />
        </Field>
      </div>
      <button
        type="button"
        disabled={pending || (status === currentStatus && probability === currentProbability)}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await apiFetch(`/opportunities/${opportunityId}`, {
                method: 'PATCH',
                json: { status, probability },
              });
              router.refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error');
            }
          });
        }}
        className={buttonClass('primary')}
      >
        {pending ? 'Guardando…' : 'Aplicar cambios'}
      </button>

      <div className="border-t border-ink-100 pt-4">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm('¿Eliminar oportunidad?')) return;
            setError(null);
            startTransition(async () => {
              try {
                await apiFetch(`/opportunities/${opportunityId}`, { method: 'DELETE' });
                router.replace('/app/opportunities');
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Error');
              }
            });
          }}
          className={buttonClass('danger')}
        >
          Eliminar oportunidad
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
