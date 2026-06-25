'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const logout = () =>
    startTransition(async () => {
      try {
        await apiFetch('/auth/logout', { method: 'POST' });
      } catch {
        /* ignore */
      }
      router.replace('/login');
    });

  if (compact) {
    return (
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        aria-label="Salir"
        title="Salir"
        className="flex h-9 w-9 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-60"
      >
        <LogOut size={18} strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="mt-2 inline-flex w-full items-center justify-center rounded border border-ink-300 px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-100 disabled:opacity-60"
      disabled={pending}
    >
      {pending ? 'Saliendo…' : 'Salir'}
    </button>
  );
}
