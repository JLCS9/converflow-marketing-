'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Field, Input, buttonClass } from '@/components/ui/primitives';

interface Status {
  connected: boolean;
  email: string | null;
  status: string | null;
  lastError: string | null;
}

export function BotEmailConnect({ botId }: { botId: string }) {
  const t = useTranslations('bots');
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setStatus(await apiFetch<Status>(`/bots/${botId}/email/status`));
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  async function connect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/bots/${botId}/email/connect`, {
        method: 'POST',
        json: {
          email: String(f.get('email') ?? '').trim(),
          username: String(f.get('username') ?? '').trim() || String(f.get('email') ?? '').trim(),
          password: String(f.get('password') ?? ''),
          imapHost: String(f.get('imapHost') ?? '').trim(),
          imapPort: Number(f.get('imapPort') ?? 993),
          smtpHost: String(f.get('smtpHost') ?? '').trim(),
          smtpPort: Number(f.get('smtpPort') ?? 465),
        },
      });
      await load();
      router.refresh();
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
      await apiFetch(`/bots/${botId}/email`, { method: 'DELETE' });
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status?.connected) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-green-700">
          {t('emailConnected')} <strong>{status.email}</strong>
          {status.status === 'ERROR' && (
            <span className="text-red-600"> {t('syncError', { error: status.lastError ?? '' })}</span>
          )}
        </p>
        <button type="button" disabled={busy} className={buttonClass('secondary')} onClick={disconnect}>
          {busy ? '…' : t('disconnect')}
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={connect}>
      <p className="text-xs text-ink-500">
        {t('imapIntro1')}
        <strong> {t('appPassword')}</strong> {t('imapIntro2')}
      </p>
      <Field label={t('emailLabel')} required>
        <Input name="email" type="email" required placeholder={t('emailPlaceholder')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('imapHostLabel')} required>
          <Input name="imapHost" required placeholder="imap.gmail.com" />
        </Field>
        <Field label={t('imapPortLabel')}>
          <Input name="imapPort" type="number" defaultValue={993} />
        </Field>
        <Field label={t('smtpHostLabel')} required>
          <Input name="smtpHost" required placeholder="smtp.gmail.com" />
        </Field>
        <Field label={t('smtpPortLabel')}>
          <Input name="smtpPort" type="number" defaultValue={465} />
        </Field>
      </div>
      <Field label={t('usernameLabel')} help={t('usernameHelp')}>
        <Input name="username" placeholder={t('usernamePlaceholder')} />
      </Field>
      <Field label={t('passwordLabel')} required>
        <Input name="password" type="password" required />
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <button type="submit" disabled={busy} className={buttonClass('primary')}>
        {busy ? t('verifying') : t('connectEmail')}
      </button>
    </form>
  );
}
