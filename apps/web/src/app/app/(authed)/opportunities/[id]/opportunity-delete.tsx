'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

export function OpportunityDelete({ opportunityId }: { opportunityId: string }) {
  const tToastsX = useTranslations('toasts');
  const tOpp = useTranslations('opportunities');
  const tToasts = useTranslations('toasts');
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
          title: tOpp('deleteTitle'),
          description: tOpp('deleteBody'),
          danger: true,
        });
        if (!ok) return;
        setBusy(true);
        try {
          await apiFetch(`/opportunities/${opportunityId}`, { method: 'DELETE' });
          toast.success(tToasts('oppDeleted'));
          router.replace('/app/opportunities');
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : tToastsX('deleteError'));
          setBusy(false);
        }
      }}
    >
      Eliminar oportunidad
    </button>
  );
}
