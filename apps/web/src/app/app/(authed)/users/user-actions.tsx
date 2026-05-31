'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useFeedback } from '@/components/ui/feedback';

export function UserActions({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await confirm({
          title: `Eliminar usuario ${userEmail}`,
          description: 'Pierde acceso inmediatamente. No se puede deshacer.',
          danger: true,
        });
        if (!ok) return;
        startTransition(async () => {
          try {
            await apiFetch(`/users/${userId}`, { method: 'DELETE' });
            toast.success('Usuario eliminado');
            router.refresh();
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar');
          }
        });
      }}
      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-60"
      disabled={pending}
    >
      {pending ? 'Eliminando…' : 'Eliminar'}
    </button>
  );
}
