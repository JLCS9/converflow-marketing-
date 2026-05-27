'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Field, Input, Select, buttonClass } from '@/components/ui/primitives';

interface Initial {
  maxUsers: number;
  maxBots: number;
  maxConversationsPerMonth: number;
  maxStorageGb: number;
  kitDigitalSegment: 'IV' | 'V' | null;
}

export function EditLimitsForm({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const payload = {
          maxUsers: Number(data.get('maxUsers')),
          maxBots: Number(data.get('maxBots')),
          maxConversationsPerMonth: Number(data.get('maxConversationsPerMonth')),
          maxStorageGb: Number(data.get('maxStorageGb')),
          kitDigitalSegment:
            (String(data.get('kitDigitalSegment') ?? '') || null) as
              | 'IV'
              | 'V'
              | null,
        };
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          try {
            await apiFetch(`/admin/tenants/${tenantId}/limits`, {
              method: 'PATCH',
              json: payload,
            });
            setSuccess(true);
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error inesperado');
          }
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Max usuarios">
          <Input
            name="maxUsers"
            type="number"
            min={1}
            max={1000}
            defaultValue={initial.maxUsers}
            required
          />
        </Field>
        <Field label="Max bots">
          <Input
            name="maxBots"
            type="number"
            min={0}
            max={100}
            defaultValue={initial.maxBots}
            required
          />
        </Field>
        <Field label="Conversaciones/mes">
          <Input
            name="maxConversationsPerMonth"
            type="number"
            min={0}
            defaultValue={initial.maxConversationsPerMonth}
            required
          />
        </Field>
        <Field label="Almacenamiento (GB)">
          <Input
            name="maxStorageGb"
            type="number"
            min={0}
            max={1000}
            defaultValue={initial.maxStorageGb}
            required
          />
        </Field>
      </div>

      <Field label="Segmento Kit Digital">
        <Select
          name="kitDigitalSegment"
          defaultValue={initial.kitDigitalSegment ?? ''}
        >
          <option value="">— No aplica —</option>
          <option value="IV">Segmento IV (20 usuarios)</option>
          <option value="V">Segmento V (25 usuarios)</option>
        </Select>
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          ✓ Límites actualizados.
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" className={buttonClass('primary')} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
