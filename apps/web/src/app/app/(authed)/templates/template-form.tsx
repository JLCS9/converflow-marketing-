'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, buttonClass } from '@/components/ui/primitives';
import { MjmlEmailBuilder } from '@/components/ui/mjml-email-builder';

export interface TemplateData {
  id: string;
  name: string;
  subject: string | null;
  bodyHtml: string;
  mjml: string | null;
}

export function TemplateForm({ template }: { template?: TemplateData }) {
  const t = useTranslations('templates');
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [mjml, setMjml] = useState(template?.mjml ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState<string | null>(null);

  async function sendTest() {
    if (!template) return;
    setTestMsg(null);
    try {
      await apiFetch(`/email-templates/${template.id}/test`, {
        method: 'POST',
        json: { to: testTo.trim() },
      });
      setTestMsg(t('testSent'));
    } catch (err) {
      setTestMsg(err instanceof ApiError ? err.message : t('testFailed'));
    }
  }

  function save() {
    setError(null);
    if (!name.trim()) {
      setError(t('nameRequired'));
      return;
    }
    if (!mjml.trim()) {
      setError(t('emptyDesign'));
      return;
    }
    startTransition(async () => {
      try {
        const payload = { name: name.trim(), subject: subject.trim() || undefined, mjml };
        if (template) {
          await apiFetch(`/email-templates/${template.id}`, { method: 'PATCH', json: payload });
        } else {
          await apiFetch('/email-templates', { method: 'POST', json: payload });
        }
        router.push('/app/mail/ajustes/plantillas');
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('unexpectedError'));
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')} required help={t('nameHelp')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label={t('subject')} help={t('subjectHelp')}>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-ink-500">
          {t('variablesIntro')}{' '}
          <code className="rounded bg-ink-100 px-1">{'{nombre}'}</code>,{' '}
          <code className="rounded bg-ink-100 px-1">{'{first_name}'}</code>,{' '}
          <code className="rounded bg-ink-100 px-1">{'{email}'}</code>,{' '}
          <code className="rounded bg-ink-100 px-1">{'{telefono}'}</code>. {t('variablesOutro')}
        </p>
      </Card>

      <MjmlEmailBuilder
        initialMjml={template?.mjml ?? undefined}
        onChange={(v) => setMjml(v.mjml)}
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {template && (
        <Card>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('sendTestTo')} help={t('sendTestHelp')}>
              <Input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder={t('testPlaceholder')}
              />
            </Field>
            <button
              type="button"
              onClick={() => void sendTest()}
              className={buttonClass('secondary')}
              disabled={!testTo.trim()}
            >
              {t('sendTest')}
            </button>
            {testMsg && <span className="pb-2 text-sm text-ink-600">{testMsg}</span>}
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/app/mail/ajustes/plantillas')}
          className={buttonClass('secondary')}
          disabled={pending}
        >
          {t('cancel')}
        </button>
        <button type="button" onClick={save} className={buttonClass('primary')} disabled={pending}>
          {pending ? t('saving') : template ? t('save') : t('create')}
        </button>
      </div>
    </div>
  );
}
