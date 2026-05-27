'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';

export function DeleteTenantButton({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState('');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass('danger')}
      >
        Eliminar tenant
      </button>
    );
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4">
      <h3 className="text-sm font-semibold text-red-900">
        ¿Eliminar tenant <span className="font-mono">{tenantSlug}</span>?
      </h3>
      <p className="mt-1 text-xs text-red-700">
        Borra el tenant, todos sus usuarios, bots, agentes, sesiones, invitaciones y
        logs de acceso. Esta acción no se puede deshacer.
      </p>
      <p className="mt-3 text-xs text-red-700">
        Escribe <span className="font-mono font-semibold">{tenantSlug}</span> para confirmar:
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="mt-1 w-full rounded border-red-300 text-sm"
        autoFocus
      />
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await apiFetch(`/admin/tenants/${tenantId}`, { method: 'DELETE' });
                router.replace('/admin/tenants');
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Error inesperado');
              }
            });
          }}
          disabled={pending || confirmText !== tenantSlug}
          className={buttonClass('danger')}
        >
          {pending ? 'Eliminando…' : 'Eliminar definitivamente'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText('');
            setError(null);
          }}
          className={buttonClass('secondary')}
          disabled={pending}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
