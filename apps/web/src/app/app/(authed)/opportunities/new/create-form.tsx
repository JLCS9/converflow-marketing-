'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { EntityPicker } from '@/components/ui/entity-picker';

interface Props {
  prefillLead?: { id: string; name: string } | null;
  prefillClient?: { id: string; name: string } | null;
}

export function CreateOpportunityForm({ prefillLead, prefillClient }: Props) {
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
          const leadId = String(data.get('leadId') ?? '').trim();
          const clientId = String(data.get('clientId') ?? '').trim();
          const payload = {
            name: String(data.get('name') ?? '').trim(),
            amount: amountStr ? Number(amountStr) : undefined,
            currency: String(data.get('currency') ?? 'EUR').trim(),
            status: String(data.get('status') ?? 'OPEN') as never,
            probability: Number(data.get('probability') ?? 50),
            expectedCloseDate: expectedCloseStr || undefined,
            leadId: leadId || undefined,
            clientId: clientId || undefined,
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
        <Field label="Nombre de la oportunidad" required>
          <Input name="name" type="text" required minLength={1} maxLength={150} />
        </Field>

        <div className="border-t border-ink-100 pt-4">
          <p className="mb-3 text-xs text-ink-500">
            Vincula la oportunidad a un lead o cliente existente (puedes dejar ambos vacíos).
          </p>
          <div className="space-y-4">
            <EntityPicker
              endpoint="/leads"
              name="leadId"
              label="Lead vinculado"
              defaultId={prefillLead?.id}
              defaultName={prefillLead?.name}
              placeholder="Buscar lead por nombre…"
            />
            <EntityPicker
              endpoint="/clients"
              name="clientId"
              label="Cliente vinculado"
              defaultId={prefillClient?.id}
              defaultName={prefillClient?.name}
              placeholder="Buscar cliente por nombre…"
            />
          </div>
        </div>

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
          <button
            type="button"
            onClick={() => router.push('/app/opportunities')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
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
