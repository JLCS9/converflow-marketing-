'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';

export function CreateLeadForm() {
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
          const payload = {
            name: String(data.get('name') ?? '').trim(),
            email: String(data.get('email') ?? '').trim() || undefined,
            phone: String(data.get('phone') ?? '').trim() || undefined,
            company: String(data.get('company') ?? '').trim() || undefined,
            source: String(data.get('source') ?? '').trim() || undefined,
            status: (String(data.get('status') ?? '') || undefined) as never,
          };
          setError(null);
          startTransition(async () => {
            try {
              const lead = await apiFetch<{ id: string }>('/leads', {
                method: 'POST',
                json: payload,
              });
              router.push(`/app/leads/${lead.id}`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        <Field label="Nombre" required>
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
        <Field label="Empresa">
          <Input name="company" type="text" maxLength={150} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Fuente">
            <Input name="source" type="text" placeholder="manual, web, evento, referido…" />
          </Field>
          <Field label="Status inicial">
            <Select name="status" defaultValue="NEW">
              <option value="NEW">NEW</option>
              <option value="CONTACTED">CONTACTED</option>
              <option value="QUALIFIED">QUALIFIED</option>
            </Select>
          </Field>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/leads')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            Cancelar
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Creando…' : 'Crear lead'}
          </button>
        </div>
      </form>
    </Card>
  );
}
