'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';

export function CampaignActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canCancel = status === 'SCHEDULED' || status === 'SENDING';
  const canDelete = status !== 'SENDING';

  function run(action: 'cancel' | 'delete') {
    setError(null);
    startTransition(async () => {
      try {
        if (action === 'cancel') {
          await apiFetch(`/campaigns/${id}/cancel`, { method: 'POST' });
          router.refresh();
        } else {
          await apiFetch(`/campaigns/${id}`, { method: 'DELETE' });
          router.push('/app/campaigns');
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error');
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-red-600">{error}</span>}
      {canCancel && (
        <button onClick={() => run('cancel')} className={buttonClass('secondary')} disabled={pending}>
          Cancelar envío
        </button>
      )}
      {canDelete && (
        <button onClick={() => run('delete')} className={buttonClass('danger')} disabled={pending}>
          Eliminar
        </button>
      )}
    </div>
  );
}
