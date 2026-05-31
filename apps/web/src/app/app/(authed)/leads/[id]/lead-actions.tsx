'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import { LEAD_STATUS } from '@/lib/labels';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'] as const;

export function LeadActions({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: (typeof STATUSES)[number];
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [status, setStatus] = useState<string>(currentStatus);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <label className="flex flex-col text-sm">
          <span className="text-xs text-ink-500">Cambiar status</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS[s]}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          disabled={pending || status === currentStatus}
          onClick={() => {
            startTransition(async () => {
              try {
                await apiFetch(`/leads/${leadId}`, { method: 'PATCH', json: { status } });
                toast.success('Status actualizado');
                router.refresh();
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar');
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
          onClick={async () => {
            const ok = await confirm({
              title: 'Eliminar lead',
              description: 'Se borran también notas y conversaciones vinculadas. No se puede deshacer.',
              danger: true,
            });
            if (!ok) return;
            startTransition(async () => {
              try {
                await apiFetch(`/leads/${leadId}`, { method: 'DELETE' });
                toast.success('Lead eliminado');
                router.replace('/app/leads');
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar');
              }
            });
          }}
          className={buttonClass('danger')}
        >
          Eliminar lead
        </button>
      </div>
    </div>
  );
}
