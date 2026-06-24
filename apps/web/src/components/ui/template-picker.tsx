'use client';

import { useEffect, useState } from 'react';
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
  const [tpls, setTpls] = useState<EmailTemplate[]>([]);

  useEffect(() => {
    let active = true;
    apiFetch<EmailTemplate[]>('/email-templates')
      .then((t) => active && setTpls(Array.isArray(t) ? t : []))
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
        const t = tpls.find((x) => x.id === e.target.value);
        if (t) onPick(t);
        e.currentTarget.value = '';
      }}
      className={
        className ?? 'rounded-md border border-ink-300 px-2 py-1 text-xs text-ink-700'
      }
      title="Insertar una plantilla"
    >
      <option value="">Usar plantilla…</option>
      {tpls.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
