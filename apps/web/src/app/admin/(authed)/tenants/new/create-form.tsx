'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';

interface CreateResponse {
  tenant: { id: string; name: string; slug: string };
  ownerTempPassword: string;
}

export function CreateTenantForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [pending, startTransition] = useTransition();

  if (result) {
    return (
      <Card className="space-y-4">
        <h2 className="text-base font-semibold">✅ Tenant creado</h2>
        <p className="text-sm text-ink-500">
          Apunta esta contraseña temporal y entrégasela al owner por un canal seguro
          (1Password / Bitwarden / Signal). No volverá a mostrarse.
        </p>
        <dl className="space-y-2 rounded-md bg-ink-100/60 p-4 font-mono text-sm">
          <div>
            <dt className="text-xs text-ink-500">Tenant ID</dt>
            <dd>{result.tenant.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Slug</dt>
            <dd>{result.tenant.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Owner password (temporal)</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="flex-1 select-all rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
                {result.ownerTempPassword}
              </code>
              <CopyButton value={result.ownerTempPassword} />
            </dd>
          </div>
        </dl>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push(`/admin/tenants/${result.tenant.id}`)}
            className={buttonClass('primary')}
          >
            Ver detalle
          </button>
          <button
            type="button"
            onClick={() => setResult(null)}
            className={buttonClass('secondary')}
          >
            Crear otro
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const payload = {
            name: String(data.get('name') ?? '').trim(),
            slug: String(data.get('slug') ?? '').trim(),
            contactEmail: String(data.get('contactEmail') ?? '').trim(),
            contactPhone: String(data.get('contactPhone') ?? '').trim() || undefined,
            ownerEmail: String(data.get('ownerEmail') ?? '').trim(),
            ownerName: String(data.get('ownerName') ?? '').trim(),
            kitDigitalSegment:
              (String(data.get('kitDigitalSegment') ?? '') || undefined) as
                | 'IV'
                | 'V'
                | undefined,
          };
          setError(null);
          startTransition(async () => {
            try {
              const res = await apiFetch<CreateResponse>('/admin/tenants', {
                method: 'POST',
                json: payload,
              });
              setResult(res);
            } catch (err) {
              setError(
                err instanceof ApiError ? err.message : 'Error inesperado al crear tenant',
              );
            }
          });
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre" required>
            <Input name="name" type="text" required minLength={2} maxLength={100} />
          </Field>
          <Field
            label="Slug"
            required
            help="Identificador URL-safe (sin espacios). Solo letras minúsculas, números y guiones."
          >
            <Input
              name="slug"
              type="text"
              required
              pattern="[a-z0-9-]+"
              minLength={3}
              maxLength={40}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email de contacto" required>
            <Input name="contactEmail" type="email" required />
          </Field>
          <Field label="Teléfono de contacto">
            <Input name="contactPhone" type="tel" />
          </Field>
        </div>

        <hr className="border-ink-100" />
        <p className="text-sm text-ink-500">Owner del tenant (recibe credenciales).</p>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre del owner" required>
            <Input name="ownerName" type="text" required minLength={2} maxLength={100} />
          </Field>
          <Field label="Email del owner" required>
            <Input name="ownerEmail" type="email" required />
          </Field>
        </div>

        <Field label="Segmento Kit Digital" help="Solo si el tenant se acoge a Kit Digital.">
          <Select name="kitDigitalSegment" defaultValue="">
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

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/admin/tenants')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            Cancelar
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Creando…' : 'Crear tenant'}
          </button>
        </div>
      </form>
    </Card>
  );
}
