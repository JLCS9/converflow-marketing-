'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

type Status = 'PENDING' | 'CONNECTED' | 'DEGRADED' | 'ERROR' | 'DISCONNECTED';

export interface WoocommerceStatus {
  status: Status;
  storeName?: string | null;
  storeUrl?: string | null;
  pluginVersion?: string | null;
  lastError?: string | null;
  lastSyncedAt?: string | null;
  ordersImported?: number;
  productsImported?: number;
  connectedAt?: string | null;
}

interface ConnectResponse {
  connectionKey: string;
  expiresAt: string;
  webhookBaseUrl: string;
}

const STATUS_COLOR: Record<Status, 'green' | 'yellow' | 'red' | 'gray'> = {
  CONNECTED: 'green',
  PENDING: 'yellow',
  DEGRADED: 'yellow',
  ERROR: 'red',
  DISCONNECTED: 'gray',
};

const POLL_MS = 4000;
const POLL_MAX_TRIES = 90; // ~6 min, cubre el TTL de 30 min de sobra para el caso normal

/**
 * Tarjeta WooCommerce · Ajustes → Integraciones. Flujo: generar clave de
 * conexión (un solo uso, 30 min) → el humano la pega en el plugin de
 * WordPress → el plugin hace el handshake solo → esta tarjeta hace polling
 * mientras el panel de la clave está abierto para detectarlo sin recargar.
 */
export function WoocommerceCard({ initialStatus }: { initialStatus: WoocommerceStatus }) {
  const t = useTranslations('settings.integrations.woocommerce');
  const { toast, confirm } = useFeedback();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ConnectResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      if (tries > POLL_MAX_TRIES) return stopPolling();
      try {
        const s = await apiFetch<WoocommerceStatus>('/integrations/woocommerce/status');
        if (s.status === 'CONNECTED') {
          setStatus(s);
          setPending(null);
          stopPolling();
          toast.success(t('connectedToast'));
        }
      } catch {
        // silencioso: un fallo puntual de polling no debe interrumpir al usuario
      }
    }, POLL_MS);
  }

  async function connect() {
    setBusy(true);
    try {
      const res = await apiFetch<ConnectResponse>('/integrations/woocommerce/connect');
      setPending(res);
      setCopied(false);
      startPolling();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('unexpectedError'));
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!pending) return;
    try {
      await navigator.clipboard.writeText(pending.connectionKey);
      setCopied(true);
    } catch {
      toast.error(t('unexpectedError'));
    }
  }

  async function disconnect() {
    const ok = await confirm({
      title: t('disconnectConfirmTitle'),
      description: t('disconnectConfirmDescription'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch('/integrations/woocommerce', { method: 'DELETE' });
      setStatus({ status: 'DISCONNECTED' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('unexpectedError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('title')}</h2>
          <p className="mt-1 text-xs text-ink-500">{t('description')}</p>
        </div>
        <Badge color={STATUS_COLOR[status.status]}>{t(`status${status.status}`)}</Badge>
      </div>

      {status.status === 'CONNECTED' && (
        <div className="mt-4 space-y-1 text-sm text-ink-700">
          {status.storeName && <div className="font-medium text-ink-900">{status.storeName}</div>}
          {status.storeUrl && <div className="text-xs text-ink-500">{status.storeUrl}</div>}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
            <span>{t('ordersImported', { count: status.ordersImported ?? 0 })}</span>
            <span>{t('productsImported', { count: status.productsImported ?? 0 })}</span>
            {status.lastSyncedAt && (
              <span>{t('lastSynced', { date: new Date(status.lastSyncedAt).toLocaleString('es-ES') })}</span>
            )}
          </div>
          {status.pluginVersion && (
            <div className="text-[11px] text-ink-400">{t('pluginVersion', { version: status.pluginVersion })}</div>
          )}
        </div>
      )}

      {status.status === 'ERROR' && status.lastError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {status.lastError}
        </div>
      )}

      {pending && (
        <div className="mt-4 rounded-md border border-primary-200 bg-primary-50/60 p-3">
          <p className="text-sm font-medium text-ink-900">{t('keyReadyTitle')}</p>
          <p className="mt-1 text-xs text-ink-600">{t('keyReadyHelp')}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1.5 text-xs text-ink-800 ring-1 ring-ink-200">
              {pending.connectionKey}
            </code>
            <button type="button" onClick={() => void copyKey()} className={buttonClass('secondary', 'shrink-0 text-xs')}>
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-500">
            {t('keyExpiresAt', { time: new Date(pending.expiresAt).toLocaleTimeString('es-ES') })}
          </p>
          <button type="button" onClick={() => { stopPolling(); setPending(null); }} className="mt-2 text-xs text-ink-500 hover:underline">
            {t('close')}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {status.status === 'DISCONNECTED' || status.status === 'PENDING' ? (
          <button type="button" disabled={busy} onClick={() => void connect()} className={buttonClass('primary')}>
            {busy ? t('connecting') : t('connect')}
          </button>
        ) : null}
        <a href="/downloads/converflow-woocommerce-latest.zip" className={buttonClass('secondary')}>
          {t('downloadPlugin')}
        </a>
        {status.status === 'CONNECTED' && (
          <button type="button" disabled={busy} onClick={() => void disconnect()} className={buttonClass('ghost', 'text-red-600')}>
            {busy ? t('disconnecting') : t('disconnect')}
          </button>
        )}
      </div>
    </Card>
  );
}
