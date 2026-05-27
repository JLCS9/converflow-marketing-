'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Field, Input, buttonClass } from '@/components/ui/primitives';

export function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4 max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const currentPassword = String(data.get('currentPassword') ?? '');
        const newPassword = String(data.get('newPassword') ?? '');
        const confirmPassword = String(data.get('confirmPassword') ?? '');

        if (newPassword !== confirmPassword) {
          setError('La confirmación no coincide con la nueva contraseña');
          return;
        }

        setError(null);
        startTransition(async () => {
          try {
            await apiFetch('/auth/change-password', {
              method: 'POST',
              json: { currentPassword, newPassword },
            });
            // Backend cleared all sessions including current → redirect to login.
            router.replace('/login?changed=1');
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error inesperado');
          }
        });
      }}
    >
      <Field label="Contraseña actual" required>
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field
        label="Nueva contraseña"
        required
        help="Mínimo 12 caracteres, con mayúscula, minúscula y número."
      >
        <Input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </Field>
      <Field label="Confirmar nueva contraseña" required>
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button type="submit" className={buttonClass('primary')} disabled={pending}>
        {pending ? 'Cambiando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
