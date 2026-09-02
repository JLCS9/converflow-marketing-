'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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

/** Mes anterior al actual, en YYYY-MM (el que ya está cerrado). */
function lastClosedMonth(): string {
  const d = new Date();
  d.setUTCDate(0);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function AiReportPanel({ initialReports }: { initialReports: ReportRow[] }) {
  const t = useTranslations('aiReport');
  const { toast } = useFeedback();
  const [reports, setReports] = useState(initialReports);
  const [busy, setBusy] = useState(false);

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
                <h2 className="text-sm font-semibold text-ink-900">{r.month}</h2>
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
                <Stat label={t('statCost')} value={`${r.metrics.ai.costUsd.toFixed(2)} $`} />
              </div>

              {r.narrative ? (
                <p className="whitespace-pre-wrap rounded-md bg-ink-100/60 p-3 text-sm text-ink-800">
                  {r.narrative}
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
