'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';

export function UserActions({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={() => {
          if (!confirm(`¿Eliminar usuario ${userEmail}? Esta acción no se puede deshacer.`)) {
            return;
          }
          setError(null);
          startTransition(async () => {
            try {
              await apiFetch(`/users/${userId}`, { method: 'DELETE' });
              router.refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error');
            }
          });
        }}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-60"
        disabled={pending}
      >
        {pending ? 'Eliminando…' : 'Eliminar'}
      </button>
    </div>
  );
}
