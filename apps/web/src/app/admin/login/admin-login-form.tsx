'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';

interface LoginResponse {
  requires2fa?: boolean;
  admin?: { id: string; email: string; name: string };
}

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [requires2fa, setRequires2fa] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4 rounded-lg border border-ink-700 bg-ink-700/30 p-6 backdrop-blur"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const email = String(data.get('email') ?? '').trim();
        const password = String(data.get('password') ?? '');
        const totp = String(data.get('totp') ?? '').trim() || undefined;
        setError(null);
        startTransition(async () => {
          try {
            const res = await apiFetch<LoginResponse>('/admin/auth/login', {
              method: 'POST',
              json: { email, password, totp },
            });
            if (res.requires2fa) {
              setRequires2fa(true);
              return;
            }
            router.push('/admin');
          } catch (err) {
            if (err instanceof ApiError) setError(err.message);
            else setError('Error inesperado');
          }
        });
      }}
    >
      <label className="block">
        <span className="text-sm font-medium text-ink-300">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-md border-ink-700 bg-ink-900 text-white"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink-300">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border-ink-700 bg-ink-900 text-white"
        />
      </label>
      {requires2fa && (
        <label className="block">
          <span className="text-sm font-medium text-ink-300">Código TOTP</span>
          <input
            name="totp"
            inputMode="numeric"
            pattern="[0-9]{6}"
            required
            autoFocus
            className="mt-1 w-full rounded-md border-ink-700 bg-ink-900 text-white font-mono tracking-widest"
          />
        </label>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-60"
      >
        {pending ? 'Verificando…' : 'Entrar'}
      </button>
    </form>
  );
}
