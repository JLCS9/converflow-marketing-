'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { EntityPicker } from '@/components/ui/entity-picker';
import { CustomFieldsForm } from '@/components/custom-fields/form';
import { useFeedback } from '@/components/ui/feedback';
import { useUnsavedWarning } from '@/lib/use-unsaved-warning';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';
import type { Pipeline } from '../types';

interface Props {
  prefillLead?: { id: string; name: string } | null;
  prefillClient?: { id: string; name: string } | null;
  customFields: CustomFieldDefinition[];
  pipelines: Pipeline[];
}

export function CreateOpportunityForm({
  prefillLead,
  prefillClient,
  customFields,
  pipelines,
}: Props) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cfValues, setCfValues] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useUnsavedWarning(dirty && !submitting);
  const visibleCustom = customFields.filter((c) => !c.archivedAt);

  async function handleCancel() {
    if (dirty) {
      const ok = await confirm({
        title: 'Descartar cambios',
        description: 'Se perderá lo que has escrito.',
        confirmLabel: 'Descartar',
        danger: true,
      });
      if (!ok) return;
    }
    router.push('/app/opportunities');
  }

  const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
  const [pipelineId, setPipelineId] = useState<string>(defaultPipeline?.id ?? '');
  const stages = useMemo(() => {
    const p = pipelines.find((x) => x.id === pipelineId);
    return p ? [...p.stages].sort((a, b) => a.order - b.order) : [];
  }, [pipelines, pipelineId]);
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? '');

  function onPipelineChange(id: string) {
    setPipelineId(id);
    const p = pipelines.find((x) => x.id === id);
    setStageId(p?.stages[0]?.id ?? '');
  }

  return (
    <Card>
      <form
        className="space-y-5"
        onChange={() => setDirty(true)}
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
            probability: Number(data.get('probability') ?? 50),
            expectedCloseDate: expectedCloseStr || undefined,
            leadId: leadId || undefined,
            clientId: clientId || undefined,
            pipelineId: pipelineId || undefined,
            stageId: stageId || undefined,
            customFields: Object.keys(cfValues).length ? cfValues : undefined,
          };
          setError(null);
          setSubmitting(true);
          startTransition(async () => {
            try {
              const opp = await apiFetch<{ id: string }>('/opportunities', {
                method: 'POST',
                json: payload,
              });
              toast.success('Oportunidad creada');
              router.push(`/app/opportunities/${opp.id}`);
            } catch (err) {
              setSubmitting(false);
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
          <Field label="Tablero">
            <Select
              value={pipelineId}
              onChange={(e) => onPipelineChange(e.target.value)}
            >
              {pipelines.length === 0 && <option value="">— sin tableros —</option>}
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? ' · por defecto' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Etapa inicial">
            <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
              {stages.length === 0 && <option value="">—</option>}
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Probabilidad (%)">
            <Input name="probability" type="number" min={0} max={100} defaultValue={50} />
          </Field>
          <Field label="Cierre esperado">
            <Input name="expectedCloseDate" type="date" />
          </Field>
        </div>

        {visibleCustom.length > 0 && (
          <div className="border-t border-ink-100 pt-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">
              Campos personalizados
            </h3>
            <div className="mt-3">
              <CustomFieldsForm
                definitions={visibleCustom}
                values={cfValues}
                onChange={setCfValues}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
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
