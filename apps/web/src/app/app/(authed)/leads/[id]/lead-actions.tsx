'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Select, buttonClass } from '@/components/ui/primitives';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'] as const;

export function LeadActions({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: (typeof STATUSES)[number];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <label className="flex flex-col text-sm">
          <span className="text-xs text-ink-500">Cambiar status</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          disabled={pending || status === currentStatus}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await apiFetch(`/leads/${leadId}`, { method: 'PATCH', json: { status } });
                router.refresh();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Error');
              }
            });
          }}
          className={buttonClass('primary')}
        >
          {pending ? 'Guardando…' : 'Aplicar'}
        </button>
      </div>

      <div className="border-t border-ink-100 pt-4">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) return;
            setError(null);
            startTransition(async () => {
              try {
                await apiFetch(`/leads/${leadId}`, { method: 'DELETE' });
                router.replace('/app/leads');
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Error');
              }
            });
          }}
          className={buttonClass('danger')}
        >
          Eliminar lead
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
