'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

type Status = 'PENDING' | 'CONNECTED' | 'DEGRADED' | 'ERROR' | 'DISCONNECTED';

export interface WoocommerceConnection {
  id: string;
  label?: string | null;
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
  connectionId: string;
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
 * Tarjeta WooCommerce · Ajustes → Integraciones. Lista de tiendas (varias
 * por tenant, a propósito — p. ej. una instalación de WordPress por idioma
 * del mismo negocio, todas alimentando el mismo CRM) + botón «Añadir
 * tienda». Al generar una clave, hace polling sobre ESA conexión concreta
 * mientras el panel está abierto, para detectar el handshake sin recargar.
 */
export function WoocommerceCard({ initialConnections }: { initialConnections: WoocommerceConnection[] }) {
  const t = useTranslations('settings.integrations.woocommerce');
  const { toast, confirm } = useFeedback();
  const [connections, setConnections] = useState(initialConnections);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
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

  function startPolling(connectionId: string) {
    stopPolling();
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      if (tries > POLL_MAX_TRIES) return stopPolling();
      try {
        const list = await apiFetch<WoocommerceConnection[]>('/integrations/woocommerce/connections');
        const mine = list.find((c) => c.id === connectionId);
        if (mine?.status === 'CONNECTED') {
          setConnections(list);
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
      const res = await apiFetch<ConnectResponse>('/integrations/woocommerce/connect', {
        method: 'POST',
        json: { label: label.trim() || undefined },
      });
      setPending(res);
      setCopied(false);
      setAdding(false);
      setLabel('');
      startPolling(res.connectionId);
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

  async function disconnect(connectionId: string) {
    const ok = await confirm({
      title: t('disconnectConfirmTitle'),
      description: t('disconnectConfirmDescription'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/integrations/woocommerce/${connectionId}`, { method: 'DELETE' });
      setConnections((prev) =>
        prev.map((c) => (c.id === connectionId ? { ...c, status: 'DISCONNECTED' as const } : c)),
      );
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
      </div>

      {connections.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-100">
          {connections.map((c) => (
            <li key={c.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">
                      {c.label || c.storeName || t('unlabeledStore')}
                    </span>
                    <Badge color={STATUS_COLOR[c.status]}>{t(`status${c.status}`)}</Badge>
                  </div>
                  {c.status === 'CONNECTED' && (
                    <div className="mt-1 space-y-0.5 text-xs text-ink-500">
                      {c.storeUrl && <div>{c.storeUrl}</div>}
                      <div className="flex flex-wrap gap-x-3">
                        <span>{t('ordersImported', { count: c.ordersImported ?? 0 })}</span>
                        <span>{t('productsImported', { count: c.productsImported ?? 0 })}</span>
                        {c.lastSyncedAt && (
                          <span>{t('lastSynced', { date: new Date(c.lastSyncedAt).toLocaleString('es-ES') })}</span>
                        )}
                      </div>
                      {c.pluginVersion && (
                        <div className="text-[11px] text-ink-400">{t('pluginVersion', { version: c.pluginVersion })}</div>
                      )}
                    </div>
                  )}
                  {c.status === 'ERROR' && c.lastError && (
                    <p className="mt-1 text-xs text-red-600">{c.lastError}</p>
                  )}
                </div>
                {c.status !== 'DISCONNECTED' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void disconnect(c.id)}
                    className="shrink-0 text-xs text-red-600 hover:underline"
                  >
                    {t('disconnect')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
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

      {adding && !pending && (
        <div className="mt-4 flex items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('labelPlaceholder')}
            className="flex-1 rounded border border-ink-300 px-2 py-1.5 text-sm focus:border-ink-700 focus:outline-none"
          />
          <button type="button" disabled={busy} onClick={() => void connect()} className={buttonClass('primary')}>
            {busy ? t('connecting') : t('generateKey')}
          </button>
          <button type="button" onClick={() => setAdding(false)} className={buttonClass('ghost')}>
            {t('close')}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!adding && !pending && (
          <button type="button" onClick={() => setAdding(true)} className={buttonClass('primary', 'inline-flex items-center gap-1.5')}>
            <Plus size={14} /> {t('addStore')}
          </button>
        )}
        <a href="/downloads/converflow-woocommerce-latest.zip" className={buttonClass('secondary')}>
          {t('downloadPlugin')}
        </a>
      </div>
    </Card>
  );
}
