'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';

interface InviteResponse {
  user: { id: string; email: string };
  tempPassword: string;
}

export function InviteUserForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResponse | null>(null);
  const [pending, startTransition] = useTransition();

  if (result) {
    return (
      <Card className="space-y-4">
        <h2 className="text-base font-semibold">✅ Usuario creado</h2>
        <dl className="space-y-2 rounded-md bg-ink-100/60 p-4 font-mono text-sm">
          <div>
            <dt className="text-xs text-ink-500">Email</dt>
            <dd>{result.user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Contraseña temporal</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="flex-1 select-all rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
                {result.tempPassword}
              </code>
              <CopyButton value={result.tempPassword} />
            </dd>
          </div>
        </dl>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/users')}
            className={buttonClass('primary')}
          >
            Volver a usuarios
          </button>
          <button
            type="button"
            onClick={() => setResult(null)}
            className={buttonClass('secondary')}
          >
            Invitar otro
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
            email: String(data.get('email') ?? '').trim(),
            name: String(data.get('name') ?? '').trim(),
            role: String(data.get('role') ?? 'AGENT_USER') as
              | 'OWNER'
              | 'ADMIN'
              | 'BUILDER'
              | 'AGENT_USER',
          };
          setError(null);
          startTransition(async () => {
            try {
              const res = await apiFetch<InviteResponse>('/users/invite', {
                method: 'POST',
                json: payload,
              });
              setResult(res);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        <Field label="Email" required>
          <Input name="email" type="email" required />
        </Field>
        <Field label="Nombre" required>
          <Input name="name" type="text" required minLength={2} maxLength={100} />
        </Field>
        <Field label="Rol" required>
          <Select name="role" defaultValue="AGENT_USER">
            <option value="AGENT_USER">AGENT_USER — uso del producto</option>
            <option value="BUILDER">BUILDER — diseñar agentes y bots</option>
            <option value="ADMIN">ADMIN — gestión completa del tenant</option>
            <option value="OWNER">OWNER — propietario, control total</option>
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
            onClick={() => router.push('/app/users')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            Cancelar
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Card>
  );
}
