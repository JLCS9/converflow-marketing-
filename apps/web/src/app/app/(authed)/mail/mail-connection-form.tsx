'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';

export interface MailConnectionData {
  id: string;
  fromAddress: string;
  displayName: string | null;
  signature: string | null;
  imapHost: string | null;
  imapPort: number | null;
  smtpHost: string | null;
  smtpPort: number | null;
  username: string | null;
  smtpSecure: boolean | null;
  imapSecure: boolean | null;
  secure: boolean;
  visibility: string;
}

/**
 * Mirror of the server's `resolveSecure`: implicit TLS on 465/993, STARTTLS or
 * plain on 25/143/587. Keeps the checkbox showing what will actually happen so
 * the user never has to reason about TLS unless they have a weird port.
 */
function deriveSecure(port: number): boolean {
  if (port === 465 || port === 993) return true;
  if (port === 25 || port === 143 || port === 587) return false;
  return true;
}

const PRESETS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; noteKey?: string }> = {
  gmail: { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465, noteKey: 'presetNoteGmail' },
  // SMTP 587 (STARTTLS) + IMAP 993 (TLS): los dos transportes NO coinciden, que
  // es justo lo que rompía este preset cuando había un solo flag para ambos.
  outlook: { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587, noteKey: 'presetNoteOutlook' },
  ionos: { imapHost: 'imap.ionos.es', imapPort: 993, smtpHost: 'smtp.ionos.es', smtpPort: 465 },
};

export function MailConnectionForm({ connection }: { connection?: MailConnectionData }) {
  const t = useTranslations('mailboxes');
  const router = useRouter();
  const c = connection;
  const [fromAddress, setFromAddress] = useState(c?.fromAddress ?? '');
  const [displayName, setDisplayName] = useState(c?.displayName ?? '');
  const [imapHost, setImapHost] = useState(c?.imapHost ?? '');
  const [imapPort, setImapPort] = useState(String(c?.imapPort ?? 993));
  const [smtpHost, setSmtpHost] = useState(c?.smtpHost ?? '');
  const [smtpPort, setSmtpPort] = useState(String(c?.smtpPort ?? 465));
  const [username, setUsername] = useState(c?.username ?? '');
  const [secret, setSecret] = useState('');
  // null = «deriva del puerto». Solo pasa a explícito si el usuario lo fuerza
  // en los ajustes avanzados, para puertos no estándar.
  const [smtpSecure, setSmtpSecure] = useState<boolean | null>(c?.smtpSecure ?? null);
  const [imapSecure, setImapSecure] = useState<boolean | null>(c?.imapSecure ?? null);
  const [showTls, setShowTls] = useState(false);
  const [visibility, setVisibility] = useState(c?.visibility ?? 'SHARED');
  const [signature, setSignature] = useState(c?.signature ?? '');
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyPreset(key: string) {
    const p = PRESETS[key];
    if (!p) {
      setPresetNote(null);
      return;
    }
    setImapHost(p.imapHost);
    setImapPort(String(p.imapPort));
    setSmtpHost(p.smtpHost);
    setSmtpPort(String(p.smtpPort));
    // Los presets usan puertos estándar → dejar que el servidor derive el TLS.
    setSmtpSecure(null);
    setImapSecure(null);
    setPresetNote(p.noteKey ?? null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          driver: 'SMTP_IMAP',
          fromAddress: fromAddress.trim(),
          displayName: displayName.trim() || undefined,
          imapHost: imapHost.trim(),
          imapPort: Number(imapPort) || 993,
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 465,
          username: (username.trim() || fromAddress.trim()),
          // Omitidos = el servidor los deriva del puerto.
          ...(smtpSecure === null ? {} : { smtpSecure }),
          ...(imapSecure === null ? {} : { imapSecure }),
          visibility,
          signature: signature.trim(),
          ...(secret ? { secret } : {}),
        };
        if (c) {
          await apiFetch(`/mail/connections/${c.id}`, { method: 'PATCH', json: payload });
        } else {
          await apiFetch('/mail/connections', { method: 'POST', json: payload });
        }
        router.push('/app/mail/ajustes');
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('unexpectedError'));
      }
    });
  }

  const effectiveImapSecure = imapSecure ?? deriveSecure(Number(imapPort) || 993);
  const effectiveSmtpSecure = smtpSecure ?? deriveSecure(Number(smtpPort) || 465);

  return (
    <Card>
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('fromAddress')} required help={t('fromAddressHelp')}>
            <Input type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="ventas@tuempresa.com" />
          </Field>
          <Field label={t('displayName')} help={t('displayNameHelp')}>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('displayNamePlaceholder')} />
          </Field>
        </div>

        <Field label={t('provider')}>
          <Select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="">{t('choosePreset')}</option>
            <option value="gmail">Gmail / Google Workspace</option>
            <option value="outlook">Outlook / Microsoft 365</option>
            <option value="ionos">IONOS</option>
          </Select>
        </Field>
        {presetNote && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{t(presetNote)}</p>}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('imapServer')} required>
            <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.tuempresa.com" />
          </Field>
          <Field label={t('imapPort')}>
            <Input value={imapPort} onChange={(e) => setImapPort(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label={t('smtpServer')} required>
            <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.tuempresa.com" />
          </Field>
          <Field label={t('smtpPort')}>
            <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label={t('username')} help={t('usernameHelp')}>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('usernamePlaceholder')} />
          </Field>
          <Field label={c ? t('passwordEdit') : t('passwordNew')} required={!c}>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>

        <div className="rounded-md border border-ink-100 bg-ink-100/30 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-ink-600">
              <span className="font-medium text-ink-800">{t('encryptionLabel')}</span>{' '}
              {t('encryptionSummary', {
                imapMode: effectiveImapSecure ? t('tlsDirect') : 'STARTTLS',
                imapPort: imapPort || '—',
                smtpMode: effectiveSmtpSecure ? t('tlsDirect') : 'STARTTLS',
                smtpPort: smtpPort || '—',
              })}
            </p>
            <button
              type="button"
              onClick={() => setShowTls((v) => !v)}
              className="shrink-0 text-xs text-primary-700 hover:underline"
            >
              {showTls ? t('hide') : t('advanced')}
            </button>
          </div>
          {showTls && (
            <div className="mt-3 space-y-2 border-t border-ink-200 pt-3">
              <p className="text-xs text-ink-500">{t('advancedHint')}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={effectiveImapSecure}
                  onChange={(e) => setImapSecure(e.target.checked)}
                />
                {t('imapTls')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={effectiveSmtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                />
                {t('smtpTls')}
              </label>
            </div>
          )}
        </div>

        <Field label={t('visibility')} help={t('visibilityHelp')}>
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="SHARED">{t('visibilityShared')}</option>
            <option value="PRIVATE">{t('visibilityPrivate')}</option>
          </Select>
        </Field>

        <Field label={t('signature')} help={t('signatureHelp')}>
          <Textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            rows={4}
            placeholder={t('signaturePlaceholder')}
          />
        </Field>

        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push('/app/mail/ajustes')} className={buttonClass('secondary')} disabled={pending}>
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            className={buttonClass('primary')}
            disabled={pending || !fromAddress.trim() || !imapHost.trim() || !smtpHost.trim() || (!c && !secret)}
          >
            {pending ? t('saving') : c ? t('save') : t('connectMailboxCta')}
          </button>
        </div>
        <p className="text-xs text-ink-400">{t('saveFootnote')}</p>
      </div>
    </Card>
  );
}
