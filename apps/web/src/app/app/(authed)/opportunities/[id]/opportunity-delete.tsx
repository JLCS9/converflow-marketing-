'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

export function OpportunityDelete({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={buttonClass('danger', 'text-xs')}
      onClick={async () => {
        const ok = await confirm({
          title: 'Eliminar oportunidad',
          description: 'Se borran también las notas e historial asociados. No se puede deshacer.',
          danger: true,
        });
        if (!ok) return;
        setBusy(true);
        try {
          await apiFetch(`/opportunities/${opportunityId}`, { method: 'DELETE' });
          toast.success('Oportunidad eliminada');
          router.replace('/app/opportunities');
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : 'No se pudo eliminar');
          setBusy(false);
        }
      }}
    >
      Eliminar oportunidad
    </button>
  );
}
