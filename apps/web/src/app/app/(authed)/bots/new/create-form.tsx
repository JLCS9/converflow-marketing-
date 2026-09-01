'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';

export function CreateBotForm() {
  const t = useTranslations('bots');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState('WEBCHAT');
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const payload = {
            name: String(data.get('name') ?? '').trim(),
            channel: String(data.get('channel') ?? 'WEBCHAT'),
            phoneNumber: String(data.get('phoneNumber') ?? '').trim() || undefined,
            replyMode: String(data.get('replyMode') ?? 'SUGGEST'),
          };
          setError(null);
          startTransition(async () => {
            try {
              await apiFetch('/bots', { method: 'POST', json: payload });
              router.push('/app/bots');
            } catch (err) {
              setError(err instanceof ApiError ? err.message : t('unexpectedError'));
            }
          });
        }}
      >
        <Field label={t('nameLabel')} required help={t('nameHelp')}>
          <Input name="name" type="text" required minLength={2} maxLength={60} />
        </Field>
        <Field label={t('channelLabel')} required>
          <Select name="channel" defaultValue="WEBCHAT" onChange={(e) => setChannel(e.target.value)}>
            <option value="WEBCHAT">{t('channelWebchat')}</option>
            <option value="WHATSAPP">{t('channelWhatsapp')}</option>
            <option value="EMAIL">{t('channelEmail')}</option>
            <option value="INSTAGRAM">{t('channelInstagram')}</option>
            <option value="MESSENGER">{t('channelMessenger')}</option>
          </Select>
        </Field>

        {channel === 'EMAIL' && (
          <Field label={t('inboundEmailLabel')} required help={t('inboundEmailHelp')}>
            <Input name="phoneNumber" type="email" placeholder={t('emailPlaceholder')} />
          </Field>
        )}

        <Field label={t('replyModeLabel')} help={t('replyModeHelp')}>
          <Select name="replyMode" defaultValue={channel === 'WEBCHAT' ? 'AUTO' : 'SUGGEST'}>
            <option value="OFF">{t('replyOptOff')}</option>
            <option value="SUGGEST">{t('replyOptSuggest')}</option>
            <option value="AUTO">{t('replyOptAuto')}</option>
          </Select>
        </Field>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/bots')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            {t('cancel')}
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? t('creating') : t('createBot')}
          </button>
        </div>
      </form>
    </Card>
  );
}
