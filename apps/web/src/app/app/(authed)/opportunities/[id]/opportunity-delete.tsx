'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';

export function OpportunityDelete({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {err && <span className="text-xs text-red-600">{err}</span>}
      <button
        type="button"
        disabled={busy}
        className={buttonClass('danger', 'text-xs')}
        onClick={async () => {
          if (!confirm('¿Eliminar oportunidad? No se puede deshacer.')) return;
          setBusy(true);
          setErr(null);
          try {
            await apiFetch(`/opportunities/${opportunityId}`, { method: 'DELETE' });
            router.replace('/app/opportunities');
          } catch (e) {
            setErr(e instanceof ApiError ? e.message : 'Error');
          } finally {
            setBusy(false);
          }
        }}
      >
        Eliminar oportunidad
      </button>
    </div>
  );
}
