'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { EntityPicker } from '@/components/ui/entity-picker';
import { useFeedback } from '@/components/ui/feedback';
import { useUnsavedWarning } from '@/lib/use-unsaved-warning';
import { TASK_TYPE, PRIORITY } from '@/lib/labels';

export function CreateTaskForm({
  defaultLeadId,
  defaultLeadName,
  defaultClientId,
  defaultClientName,
  defaultOpportunityId,
  defaultOpportunityName,
}: {
  defaultLeadId?: string;
  defaultLeadName?: string;
  defaultClientId?: string;
  defaultClientName?: string;
  defaultOpportunityId?: string;
  defaultOpportunityName?: string;
} = {}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useUnsavedWarning(dirty && !submitting);

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
    router.push('/app/tasks');
  }

  return (
    <Card>
      <form
        className="space-y-5"
        onChange={() => setDirty(true)}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const dueAtStr = String(data.get('dueAt') ?? '').trim();
          const payload = {
            title: String(data.get('title') ?? '').trim(),
            description: String(data.get('description') ?? '').trim() || undefined,
            type: String(data.get('type') ?? 'OTHER') as never,
            status: String(data.get('status') ?? 'PENDING') as never,
            priority: String(data.get('priority') ?? 'MEDIUM') as never,
            dueAt: dueAtStr || undefined,
            leadId: String(data.get('leadId') ?? '').trim() || undefined,
            clientId: String(data.get('clientId') ?? '').trim() || undefined,
            opportunityId: String(data.get('opportunityId') ?? '').trim() || undefined,
          };
          setError(null);
          setSubmitting(true);
          startTransition(async () => {
            try {
              await apiFetch('/tasks', { method: 'POST', json: payload });
              toast.success('Tarea creada');
              router.push('/app/tasks');
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
              setSubmitting(false);
            }
          });
        }}
      >
        <Field label="Título" required>
          <Input name="title" type="text" required minLength={1} maxLength={200} />
        </Field>
        <Field label="Descripción">
          <Textarea name="description" rows={3} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Tipo">
            <Select name="type" defaultValue="OTHER">
              {Object.entries(TASK_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridad">
            <Select name="priority" defaultValue="MEDIUM">
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vence">
            <Input name="dueAt" type="datetime-local" />
          </Field>
        </div>

        <div className="border-t border-ink-100 pt-4">
          <p className="mb-3 text-xs text-ink-500">
            Opcional: vincula la tarea a un lead, cliente u oportunidad. Empieza a escribir el
            nombre y elige de la lista.
          </p>
          <div className="space-y-4">
            <EntityPicker
              endpoint="/leads"
              name="leadId"
              label="Lead vinculado"
              defaultId={defaultLeadId}
              defaultName={defaultLeadName}
              placeholder="Buscar lead por nombre…"
            />
            <EntityPicker
              endpoint="/clients"
              name="clientId"
              label="Cliente vinculado"
              defaultId={defaultClientId}
              defaultName={defaultClientName}
              placeholder="Buscar cliente por nombre…"
            />
            <EntityPicker
              endpoint="/opportunities"
              name="opportunityId"
              label="Oportunidad vinculada"
              defaultId={defaultOpportunityId}
              defaultName={defaultOpportunityName}
              placeholder="Buscar oportunidad por nombre…"
            />
          </div>
        </div>

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
            {pending ? 'Creando…' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </Card>
  );
}
