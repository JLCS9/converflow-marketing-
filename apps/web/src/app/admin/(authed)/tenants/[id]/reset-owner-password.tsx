'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';

interface ResetResponse {
  ownerEmail: string;
  ownerTempPassword: string;
}

export function ResetOwnerPasswordButton({ tenantId }: { tenantId: string }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ResetResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<ResetResponse>(
        `/admin/tenants/${tenantId}/reset-owner-password`,
        { method: 'POST' },
      );
      setResult(r);
      setConfirming(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
        <p className="font-medium text-amber-900">
          Nueva contraseña temporal generada para <strong>{result.ownerEmail}</strong>.
        </p>
        <p className="text-xs text-amber-800">
          Las sesiones anteriores quedaron revocadas y se forzará cambio en el primer login.
          Cópiala ahora — no volverá a mostrarse.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={result.ownerTempPassword}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded border border-amber-400 bg-white px-3 py-2 font-mono text-base tracking-wider text-amber-900"
          />
          <CopyButton value={result.ownerTempPassword} label="Copiar" />
        </div>
        <button
          type="button"
          className="text-xs text-amber-900 hover:underline"
          onClick={() => setResult(null)}
        >
          Cerrar
        </button>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className={buttonClass('secondary', 'text-xs')}
        onClick={() => setConfirming(true)}
      >
        🔑 Resetear contraseña del owner
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-ink-200 bg-ink-100/40 p-3 text-sm">
      <p className="text-ink-700">
        Se generará una nueva contraseña temporal para el OWNER y se cerrarán todas sus sesiones activas. ¿Continuar?
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          className={buttonClass('danger', 'text-xs')}
          onClick={() => void run()}
        >
          {busy ? 'Generando…' : 'Sí, resetear'}
        </button>
        <button
          type="button"
          disabled={busy}
          className={buttonClass('ghost', 'text-xs')}
          onClick={() => setConfirming(false)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
