'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Badge, buttonClass } from '@/components/ui/primitives';

interface Connection {
  status: string;
  qr: string | null;
  persistedStatus: string;
}

const statusColor: Record<string, 'gray' | 'green' | 'yellow' | 'red' | 'blue'> = {
  PENDING: 'gray',
  AWAITING_QR: 'yellow',
  CONNECTING: 'yellow',
  CONNECTED: 'green',
  DISCONNECTED: 'red',
  BANNED: 'red',
  ERROR: 'red',
};

const statusLabel: Record<string, string> = {
  PENDING: 'Sin conectar',
  AWAITING_QR: 'Esperando escaneo del QR',
  CONNECTING: 'Conectando…',
  CONNECTED: 'Conectado',
  DISCONNECTED: 'Desconectado',
  BANNED: 'Bloqueado por WhatsApp',
  ERROR: 'Error de conexión',
};

export function BotConnection({ botId, initialStatus }: { botId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const c = await apiFetch<Connection>(`/bots/${botId}/connection`);
      setStatus(c.status);
      setQr(c.qr);
    } catch {
      // transient — keep last known state
    }
  }, [botId]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), 2500);
    return () => clearInterval(t);
  }, [poll]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/bots/${botId}/connect`, { method: 'POST' });
      await poll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/bots/${botId}/disconnect`, { method: 'POST' });
      setQr(null);
      await poll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }

  const connected = status === 'CONNECTED';
  const active = connected || status === 'CONNECTING' || status === 'AWAITING_QR';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge color={statusColor[status] ?? 'gray'}>{statusLabel[status] ?? status}</Badge>
        {active ? (
          <button
            type="button"
            disabled={busy}
            className={buttonClass('secondary')}
            onClick={disconnect}
          >
            {busy ? '…' : 'Desconectar'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={buttonClass('primary')}
            onClick={connect}
          >
            {busy ? 'Iniciando…' : 'Conectar WhatsApp'}
          </button>
        )}
      </div>

      {status === 'AWAITING_QR' && (
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="mb-3 text-sm text-ink-700">
            En tu teléfono: <strong>WhatsApp → Ajustes → Dispositivos vinculados → Vincular
            un dispositivo</strong>, y escanea este código. Se actualiza solo.
          </p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Código QR de WhatsApp" className="h-64 w-64" />
          ) : (
            <p className="text-sm text-ink-500">Generando código…</p>
          )}
        </div>
      )}

      {connected && (
        <p className="text-sm text-green-700">
          ✓ Tu WhatsApp está conectado. La sesión se mantiene aunque se reinicie el servidor.
        </p>
      )}

      {status === 'BANNED' && (
        <p className="text-sm text-red-700">
          WhatsApp ha bloqueado este número. No reconectes inmediatamente; revisa el uso.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
