'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string | null;
  bodyHtml: string;
}

/**
 * Compact "Usar plantilla…" dropdown. Loads the tenant's email templates and
 * calls onPick with the chosen one. Renders nothing if there are no templates.
 */
export function TemplatePicker({
  onPick,
  className,
}: {
  onPick: (t: EmailTemplate) => void;
  className?: string;
}) {
  const t = useTranslations('uiBits');
  const [tpls, setTpls] = useState<EmailTemplate[]>([]);

  useEffect(() => {
    let active = true;
    apiFetch<EmailTemplate[]>('/email-templates')
      .then((list) => active && setTpls(Array.isArray(list) ? list : []))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (tpls.length === 0) return null;

  return (
    <select
      value=""
      onChange={(e) => {
        const tpl = tpls.find((x) => x.id === e.target.value);
        if (tpl) onPick(tpl);
        e.currentTarget.value = '';
      }}
      className={
        className ?? 'rounded-md border border-ink-300 px-2 py-1 text-xs text-ink-700'
      }
      title={t('insertTemplate')}
    >
      <option value="">{t('useTemplate')}</option>
      {tpls.map((tpl) => (
        <option key={tpl.id} value={tpl.id}>
          {tpl.name}
        </option>
      ))}
    </select>
  );
}
