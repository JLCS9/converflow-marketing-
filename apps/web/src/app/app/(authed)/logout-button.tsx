'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { apiFetch } from '@/lib/api-client';

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          try {
            await apiFetch('/auth/logout', { method: 'POST' });
          } catch {
            /* ignore */
          }
          router.replace('/login');
        })
      }
      className="mt-2 inline-flex w-full items-center justify-center rounded border border-ink-300 px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-100 disabled:opacity-60"
      disabled={pending}
    >
      {pending ? 'Saliendo…' : 'Salir'}
    </button>
  );
}
