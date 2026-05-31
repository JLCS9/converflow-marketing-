'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useFeedback } from '@/components/ui/feedback';

export function TaskActions({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
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
                toast.success('Tarea completada');
                router.refresh();
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : 'No se pudo completar');
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
        onClick={async () => {
          const ok = await confirm({
            title: 'Eliminar tarea',
            description: 'Esta acción no se puede deshacer.',
            danger: true,
          });
          if (!ok) return;
          startTransition(async () => {
            try {
              await apiFetch(`/tasks/${taskId}`, { method: 'DELETE' });
              toast.success('Tarea eliminada');
              router.refresh();
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : 'No se pudo eliminar');
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
