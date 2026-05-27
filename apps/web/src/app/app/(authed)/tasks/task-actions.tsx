'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

export function TaskActions({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex justify-end gap-2">
      {status !== 'DONE' && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await apiFetch(`/tasks/${taskId}`, { method: 'PATCH', json: { status: 'DONE' } });
                router.refresh();
              } catch {
                /* ignore */
              }
            })
          }
          className="text-xs text-primary-700 hover:underline disabled:opacity-60"
        >
          {pending ? '…' : 'Completar'}
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm('¿Eliminar tarea?')) return;
          startTransition(async () => {
            try {
              await apiFetch(`/tasks/${taskId}`, { method: 'DELETE' });
              router.refresh();
            } catch {
              /* ignore */
            }
          });
        }}
        className="text-xs text-red-600 hover:underline disabled:opacity-60"
      >
        Eliminar
      </button>
    </div>
  );
}
