'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';

export function CreateClientForm() {
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
            nif: String(data.get('nif') ?? '').trim() || undefined,
            address: String(data.get('address') ?? '').trim() || undefined,
            website: String(data.get('website') ?? '').trim() || undefined,
            status: (String(data.get('status') ?? 'ACTIVE')) as never,
          };
          setError(null);
          startTransition(async () => {
            try {
              const c = await apiFetch<{ id: string }>('/clients', {
                method: 'POST',
                json: payload,
              });
              router.push(`/app/clients/${c.id}`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        <Field label="Nombre / Razón social" required>
          <Input name="name" type="text" required minLength={1} maxLength={150} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="NIF / CIF">
            <Input name="nif" type="text" maxLength={20} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Teléfono">
            <Input name="phone" type="tel" />
          </Field>
          <Field label="Website">
            <Input name="website" type="url" placeholder="https://" />
          </Field>
        </div>
        <Field label="Dirección">
          <Input name="address" type="text" maxLength={255} />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue="ACTIVE">
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </Select>
        </Field>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push('/app/clients')} className={buttonClass('secondary')} disabled={pending}>
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
