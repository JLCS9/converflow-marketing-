'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { CustomFieldsForm } from '@/components/custom-fields/form';
import { useFeedback } from '@/components/ui/feedback';
import { useUnsavedWarning } from '@/lib/use-unsaved-warning';
import { CLIENT_STATUS } from '@/lib/labels';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

export function CreateClientForm({ customFields }: { customFields: CustomFieldDefinition[] }) {
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
    router.push('/app/clients');
  }

  return (
    <Card>
      <form
        className="space-y-5"
        onChange={() => setDirty(true)}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const payload = {
            name: String(data.get('name') ?? '').trim(),
            email: String(data.get('email') ?? '').trim() || undefined,
            phone: String(data.get('phone') ?? '').trim() || undefined,
            status: (String(data.get('status') ?? 'ACTIVE')) as never,
            customFields: Object.keys(cfValues).length ? cfValues : undefined,
          };
          setError(null);
          setSubmitting(true);
          startTransition(async () => {
            try {
              const c = await apiFetch<{ id: string }>('/clients', {
                method: 'POST',
                json: payload,
              });
              toast.success('Cliente creado');
              router.push(`/app/clients/${c.id}`);
            } catch (err) {
              setSubmitting(false);
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        <Field label="Nombre / Razón social" required>
          <Input name="name" type="text" required minLength={1} maxLength={150} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email">
            <Input name="email" type="email" />
          </Field>
          <Field label="Teléfono">
            <Input name="phone" type="tel" />
          </Field>
        </div>
        <Field label="Estado">
          <Select name="status" defaultValue="ACTIVE">
            {Object.entries(CLIENT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>

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
          <button type="button" onClick={handleCancel} className={buttonClass('secondary')} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Creando…' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </Card>
  );
}
