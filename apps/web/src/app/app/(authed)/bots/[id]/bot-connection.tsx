'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Badge, buttonClass } from '@/components/ui/primitives';

interface Connection {
  status: string;
  qr: string | null;
  persistedStatus: string;
  phoneNumber: string | null;
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

const statusLabelKey = {
  PENDING: 'connStatusPending',
  AWAITING_QR: 'connStatusAwaitingQr',
  CONNECTING: 'connStatusConnecting',
  CONNECTED: 'connStatusConnected',
  DISCONNECTED: 'connStatusDisconnected',
  BANNED: 'connStatusBanned',
  ERROR: 'connStatusError',
} as const;

export function BotConnection({ botId, initialStatus }: { botId: string; initialStatus: string }) {
  const t = useTranslations('bots');
  const [status, setStatus] = useState(initialStatus);
  const [qr, setQr] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const c = await apiFetch<Connection>(`/bots/${botId}/connection`);
      setStatus(c.status);
      setQr(c.qr);
      setPhoneNumber(c.phoneNumber);
    } catch {
      // transient — keep last known state
    }
  }, [botId]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), 2500);
    return () => clearInterval(timer);
  }, [poll]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/bots/${botId}/connect`, { method: 'POST' });
      await poll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('unexpectedError'));
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
      setError(err instanceof ApiError ? err.message : t('unexpectedError'));
    } finally {
      setBusy(false);
    }
  }

  const connected = status === 'CONNECTED';
  const active = connected || status === 'CONNECTING' || status === 'AWAITING_QR';
  const labelKey = statusLabelKey[status as keyof typeof statusLabelKey];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge color={statusColor[status] ?? 'gray'}>{labelKey ? t(labelKey) : status}</Badge>
        {active ? (
          <button
            type="button"
            disabled={busy}
            className={buttonClass('secondary')}
            onClick={disconnect}
          >
            {busy ? '…' : t('disconnect')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={buttonClass('primary')}
            onClick={connect}
          >
            {busy ? t('starting') : t('connectWhatsapp')}
          </button>
        )}
      </div>

      {status === 'AWAITING_QR' && (
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="mb-3 text-sm text-ink-700">
            {t('qrInstrPrefix')} <strong>{t('qrInstrPath')}</strong>
            {t('qrInstrSuffix')}
          </p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={t('qrAlt')} className="h-64 w-64" />
          ) : (
            <p className="text-sm text-ink-500">{t('qrGenerating')}</p>
          )}
        </div>
      )}

      {connected && (
        <p className="text-sm text-green-700">
          {t('connectedPrefix')}
          {phoneNumber ? (
            <>
              {' '}
              {t('connectedAtNumber')} <strong>{phoneNumber}</strong>
            </>
          ) : null}
          . {t('connectedSessionNote')}
        </p>
      )}

      {status === 'BANNED' && (
        <p className="text-sm text-red-700">{t('bannedNote')}</p>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
