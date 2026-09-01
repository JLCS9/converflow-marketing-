'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Badge } from '@/components/ui/primitives';
import { LEAD_STATUS, LEAD_STATUS_COLOR, statusColor, statusLabel } from '@/lib/labels';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';
import { LeadCard, type LeadCardData } from './lead-card';
import type { TimelineEvent } from './lead-timeline';

/**
 * Drawer lateral con la tarjeta canónica del lead. Es lo que abren las
 * bandejas (Conversaciones y Correo) en lugar de duplicar su propia ficha:
 * misma tarjeta, mismo componente, con enlace a la página completa.
 */
export function LeadDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const t = useTranslations();
  const [lead, setLead] = useState<LeadCardData | null>(null);
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, defs, tl] = await Promise.all([
        apiFetch<LeadCardData>(`/leads/${leadId}`),
        apiFetch<CustomFieldDefinition[]>('/custom-fields?entityType=LEAD').catch(
          () => [] as CustomFieldDefinition[],
        ),
        apiFetch<TimelineEvent[]>(`/leads/${leadId}/timeline`).catch(() => [] as TimelineEvent[]),
      ]);
      setLead(detail);
      setDefinitions(defs);
      setTimeline(tl);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('leadCard.loadError'));
    }
  }, [leadId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink-900/30" onClick={onClose} aria-hidden />
      <aside className="relative flex h-full w-full max-w-2xl flex-col bg-ink-50 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-ink-100 bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-ink-900">
                {lead ? [lead.name, lead.lastName].filter(Boolean).join(' ') : 'Lead'}
              </h2>
              {lead && (
                <Badge color={statusColor(LEAD_STATUS_COLOR, lead.status)}>
                  {statusLabel(LEAD_STATUS, lead.status)}
                </Badge>
              )}
            </div>
            {lead?.company && <div className="truncate text-xs text-ink-500">{lead.company}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/app/leads/${leadId}`}
              className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-xs text-ink-700 hover:bg-ink-100"
            >
              <ExternalLink size={12} />
              {t('leadCard.fullCard')}
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : !lead ? (
            <div className="py-10 text-center text-sm text-ink-400">{t('common.loading')}</div>
          ) : (
            <LeadCard
              lead={lead}
              definitions={definitions}
              timeline={timeline}
              compact
              onChanged={() => void load()}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
