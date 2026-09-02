'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/empty-state';
import { useFeedback } from '@/components/ui/feedback';

export interface ReportRow {
  id: string;
  month: string;
  metrics: {
    engine: { turns: number; resolved: number; resolutionRate: number | null };
    gaps: { opened: number; covered: number; dismissed: number; openAtEnd: number };
    verified: { created: number; fromCorrections: number };
    consents: { granted: number; revoked: number };
    playbooks: { sent: number; replied: number; suppressed: number };
    lifecycle: Record<string, number>;
    ai: { costUsd: number; calls: number };
  };
  narrative: string | null;
  updatedAt: string;
}

function pct(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`;
}

/** Narrativas antiguas llegaron con markdown: mostrarlas limpias. */
function plainNarrative(text: string): string {
  return text
    .replace(/^#{1,4}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^---\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** «2026-09» → «septiembre de 2026» en el idioma del usuario. */
function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** Mes anterior al actual, en YYYY-MM (el que ya está cerrado). */
function lastClosedMonth(): string {
  const d = new Date();
  d.setUTCDate(0);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function AiReportPanel({ initialReports }: { initialReports: ReportRow[] }) {
  const t = useTranslations('aiReport');
  const tAtt = useTranslations('attention');
  const locale = useLocale();
  const { toast } = useFeedback();
  const [reports, setReports] = useState(initialReports);
  const [busy, setBusy] = useState(false);
  const [attention, setAttention] = useState<{
    openGaps: number;
    gapsWithLead: number;
    draftPlaybooks: number;
    pendingSuggestions: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<NonNullable<typeof attention>>('/reports/attention')
      .then((a) => alive && setAttention(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function refresh() {
    setReports(await apiFetch<ReportRow[]>('/ai/reports/monthly'));
  }

  async function generate() {
    setBusy(true);
    try {
      await apiFetch('/ai/reports/monthly/generate', {
        method: 'POST',
        json: { month: lastClosedMonth() },
      });
      toast.success(t('generated'));
      await refresh();
    } catch {
      toast.error(t('genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">{t('hint')}</p>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className={buttonClass('secondary', 'shrink-0 text-xs')}
        >
          {busy ? t('generating') : t('generateNow')}
        </button>
      </div>

      {attention && (attention.openGaps > 0 || attention.draftPlaybooks > 0 || attention.pendingSuggestions > 0) && (
        <Card className="border-primary-200 bg-primary-50/40">
          <h2 className="text-sm font-semibold text-ink-900">{t('todoTitle')}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {attention.openGaps > 0 && (
              <li>
                <a href="/app/knowledge" className="text-primary-700 hover:underline">
                  {attention.gapsWithLead > 0
                    ? tAtt('gapsWithLead', { n: attention.gapsWithLead })
                    : tAtt('openGaps', { n: attention.openGaps })}{' '}
                  →
                </a>
              </li>
            )}
            {attention.draftPlaybooks > 0 && (
              <li>
                <a href="/app/playbooks" className="text-primary-700 hover:underline">
                  {tAtt('drafts', { n: attention.draftPlaybooks })} →
                </a>
              </li>
            )}
            {attention.pendingSuggestions > 0 && (
              <li>
                <a href="/app/conversations" className="text-primary-700 hover:underline">
                  {tAtt('suggestions', { n: attention.pendingSuggestions })} →
                </a>
              </li>
            )}
          </ul>
        </Card>
      )}

      {reports.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        reports.map((r, i) => {
          const prev = reports[i + 1];
          const rate = r.metrics.engine.resolutionRate;
          const prevRate = prev?.metrics.engine.resolutionRate ?? null;
          const delta = rate != null && prevRate != null ? rate - prevRate : null;
          return (
            <Card key={r.id} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold capitalize text-ink-900">{monthLabel(r.month, locale)}</h2>
                {delta != null && (
                  <Badge color={delta >= 0 ? 'green' : 'red'}>
                    {t('resolutionDelta', { delta: `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}` })}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t('statResolution')} value={pct(rate)} />
                <Stat
                  label={t('statGaps')}
                  value={`${r.metrics.gaps.covered}/${r.metrics.gaps.opened}`}
                  hint={t('statGapsHint')}
                />
                <Stat
                  label={t('statFollowups')}
                  value={`${r.metrics.playbooks.replied}/${r.metrics.playbooks.sent}`}
                  hint={t('statFollowupsHint')}
                />
                <Stat
                  label={t('statCost')}
                  value={new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(
                    r.metrics.ai.costUsd,
                  )}
                />
              </div>

              {r.narrative ? (
                <p className="whitespace-pre-wrap rounded-md bg-ink-100/60 p-3 text-sm text-ink-800">
                  {plainNarrative(r.narrative)}
                </p>
              ) : (
                <p className="text-xs text-ink-400">{t('narrativePending')}</p>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-ink-100 p-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-900">{value}</p>
      {hint && <p className="text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}
