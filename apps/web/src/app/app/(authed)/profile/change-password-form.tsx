'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Field, Input, buttonClass } from '@/components/ui/primitives';

export function ChangePasswordForm() {
  const t = useTranslations('profile');
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
          setError(t('confirmMismatch'));
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
            setError(err instanceof ApiError ? err.message : t('unexpectedError'));
          }
        });
      }}
    >
      <Field label={t('currentPassword')} required>
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field
        label={t('newPassword')}
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
      <Field label={t('confirmPassword')} required>
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
        {pending ? t('changing') : t('changePassword')}
      </button>
    </form>
  );
}
