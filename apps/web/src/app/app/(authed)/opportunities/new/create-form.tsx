'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';

export function CreateOpportunityForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const amountStr = String(data.get('amount') ?? '').trim();
          const expectedCloseStr = String(data.get('expectedCloseDate') ?? '').trim();
          const payload = {
            name: String(data.get('name') ?? '').trim(),
            amount: amountStr ? Number(amountStr) : undefined,
            currency: String(data.get('currency') ?? 'EUR').trim(),
            status: (String(data.get('status') ?? 'OPEN')) as never,
            probability: Number(data.get('probability') ?? 50),
            expectedCloseDate: expectedCloseStr || undefined,
            leadId: String(data.get('leadId') ?? '').trim() || undefined,
          };
          setError(null);
          startTransition(async () => {
            try {
              const opp = await apiFetch<{ id: string }>('/opportunities', {
                method: 'POST',
                json: payload,
              });
              router.push(`/app/opportunities/${opp.id}`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        <Field label="Nombre" required>
          <Input name="name" type="text" required minLength={1} maxLength={150} />
        </Field>
        <Field label="Lead vinculado (ID, opcional)" help="Si esta oportunidad nace de un lead, pega su ID.">
          <Input name="leadId" type="text" className="font-mono text-xs" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Importe">
            <Input name="amount" type="number" step="0.01" min={0} />
          </Field>
          <Field label="Moneda">
            <Input name="currency" type="text" defaultValue="EUR" maxLength={3} />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Status">
            <Select name="status" defaultValue="OPEN">
              <option value="OPEN">OPEN</option>
              <option value="QUOTED">QUOTED</option>
              <option value="NEGOTIATING">NEGOTIATING</option>
              <option value="WON">WON</option>
              <option value="LOST">LOST</option>
            </Select>
          </Field>
          <Field label="Probabilidad (%)">
            <Input name="probability" type="number" min={0} max={100} defaultValue={50} />
          </Field>
        </div>
        <Field label="Cierre esperado">
          <Input name="expectedCloseDate" type="date" />
        </Field>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push('/app/opportunities')} className={buttonClass('secondary')} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Creando…' : 'Crear oportunidad'}
          </button>
        </div>
      </form>
    </Card>
  );
}
