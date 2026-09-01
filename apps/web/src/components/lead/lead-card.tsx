'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Pencil, Plus, Sparkles } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Badge, Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import { CustomFieldsForm } from '@/components/custom-fields/form';
import { CustomFieldsView } from '@/components/custom-fields/view';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';
import { LEAD_STATUS_OPTIONS, OPP_STATUS, OPP_STATUS_COLOR, statusColor, statusLabel } from '@/lib/labels';
import { LeadNotes, type LeadNote } from './lead-notes';
import { LeadTimeline, type TimelineEvent } from './lead-timeline';

export interface LeadOpportunity {
  id: string;
  name: string;
  status: string;
  amount: string | null;
  currency?: string;
}

export interface LeadCardData {
  id: string;
  name: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: string;
  score: number | null;
  contactedAt: string | null;
  qualifiedAt: string | null;
  createdAt: string;
  customFields: Record<string, unknown> | null;
  aiScoreReasoning: string | null;
  aiScoreActions: string[] | null;
  aiScoredAt: string | null;
  opportunities: LeadOpportunity[];
  notes: LeadNote[];
}

function scoreTone(score: number | null): string {
  if (score == null) return 'bg-ink-100 text-ink-500';
  if (score >= 75) return 'bg-green-100 text-green-800';
  if (score >= 50) return 'bg-yellow-100 text-yellow-800';
  if (score >= 25) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

const dt = (iso: string) => new Date(iso).toLocaleDateString('es-ES');

/**
 * Tarjeta canónica del lead (Bloque 3). Única fuente de UI para el detalle:
 * la página /app/leads/[id] y el drawer de las bandejas renderizan ESTE
 * componente — tres zonas: información, comentarios y actividad.
 */
export function LeadCard({
  lead,
  definitions,
  timeline,
  compact = false,
  onChanged,
}: {
  lead: LeadCardData;
  definitions: CustomFieldDefinition[];
  timeline: TimelineEvent[];
  /** true en el drawer: zonas apiladas en una columna. */
  compact?: boolean;
  /** Extra al refresh de router (el drawer refetchea sus datos). */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations('leadCard');
  const refresh = () => {
    router.refresh();
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      <ScoreHeader lead={lead} compact={compact} onChanged={refresh} />
      <div className={compact ? 'space-y-4' : 'grid items-start gap-4 xl:grid-cols-3'}>
        <InfoZone lead={lead} definitions={definitions} onChanged={refresh} />
        <Card className="flex max-h-[34rem] flex-col">
          <h2 className="mb-3 text-sm font-mono uppercase tracking-wider text-ink-500">
            {t('comments')}
          </h2>
          <LeadNotes leadId={lead.id} notes={lead.notes} onChanged={refresh} />
        </Card>
        <Card className="max-h-[34rem] overflow-y-auto">
          <h2 className="mb-3 text-sm font-mono uppercase tracking-wider text-ink-500">
            {t('activity')}
          </h2>
          <LeadTimeline events={timeline} />
        </Card>
      </div>
    </div>
  );
}

// ---- cabecera: Score IA + botón pequeño «Análisis IA» --------------------

function ScoreHeader({
  lead,
  compact,
  onChanged,
}: {
  lead: LeadCardData;
  compact: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [scoring, startScoring] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function recalc() {
    setError(null);
    startScoring(async () => {
      try {
        await apiFetch(`/leads/${lead.id}/score`, { method: 'POST' });
        onChanged();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    });
  }

  return (
    <div className="rounded-xl border border-ink-100 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums ${scoreTone(lead.score)}`}
        >
          <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">{t('leadDetail.aiScore')}</span>
          {lead.score != null ? lead.score : '—'}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={buttonClass('secondary', 'inline-flex items-center gap-1 px-2 py-1 text-xs')}
        >
          <Sparkles size={12} />
          {t('leadCard.aiAnalysis')}
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {!compact && lead.aiScoredAt && (
          <span className="ml-auto text-xs text-ink-400">
            {t('leadCard.lastAnalysis')}: {new Date(lead.aiScoredAt).toLocaleString('es-ES')}
          </span>
        )}
      </div>
      {open && (
        <div className="border-t border-ink-100 px-4 py-3 text-sm">
          {lead.aiScoreReasoning ? (
            <div className="space-y-3">
              <p className="text-ink-700">{lead.aiScoreReasoning}</p>
              {lead.aiScoreActions && lead.aiScoreActions.length > 0 && (
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
                    {t('leadCard.recommendedActions')}
                  </div>
                  <ul className="mt-1.5 list-inside list-disc space-y-1 text-ink-700">
                    {lead.aiScoreActions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-ink-500">{t('leadCard.noAiAnalysis')}</p>
          )}
          <div className="mt-3">
            <button
              type="button"
              disabled={scoring}
              onClick={recalc}
              className={buttonClass(lead.score != null ? 'secondary' : 'primary', 'text-xs')}
            >
              {scoring
                ? t('leadCard.analyzing')
                : lead.score != null
                  ? t('leadCard.recalcScore')
                  : t('leadCard.calcScore')}
            </button>
          </div>
          {error && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- zona 1: información + campos personalizados + oportunidades ---------

function InfoZone({
  lead,
  definitions,
  onChanged,
}: {
  lead: LeadCardData;
  definitions: CustomFieldDefinition[];
  onChanged: () => void;
}) {
  const t = useTranslations();
  const { toast } = useFeedback();
  const active = definitions.filter((d) => d.entityType === 'LEAD' && !d.archivedAt);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    lastName: '',
    email: '',
    phone: '',
    source: '',
    status: lead.status,
  });
  const [cfDraft, setCfDraft] = useState<Record<string, unknown>>({});

  function startEdit() {
    setForm({
      name: lead.name,
      lastName: lead.lastName ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      source: lead.source ?? '',
      status: lead.status,
    });
    setCfDraft((lead.customFields as Record<string, unknown>) ?? {});
    setErr(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/leads/${lead.id}`, {
        method: 'PATCH',
        json: {
          name: form.name,
          lastName: form.lastName || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          source: form.source || undefined,
          status: form.status,
          ...(active.length ? { customFields: cfDraft } : {}),
        },
      });
      toast.success('Cambios guardados');
      setEditing(false);
      onChanged();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo guardar';
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('leadDetail.info')}</h2>
        {editing ? (
          <button type="button" className="text-xs text-ink-500" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-primary-700 hover:underline"
            onClick={startEdit}
          >
            <Pencil size={11} />
            {t('leadCard.edit')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('leadDetail.firstName')} required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('leadDetail.lastName')}>
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t('crm.email')}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label={t('crm.phone')}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={t('crm.source')}>
            <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </Field>
          <Field label={t('crm.status')}>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {LEAD_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          {active.length > 0 && (
            <div className="border-t border-ink-100 pt-3">
              <div className="mb-2 text-xs font-mono uppercase tracking-wider text-ink-500">
                {t('leadCard.customFields')}
              </div>
              <CustomFieldsForm definitions={active} values={cfDraft} onChange={setCfDraft} />
            </div>
          )}
          {err && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
          )}
          <button
            type="button"
            className={buttonClass('primary', 'text-xs')}
            onClick={save}
            disabled={busy}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      ) : (
        <>
          <dl className="mt-4 space-y-2 text-sm">
            {lead.lastName && <Row label={t('leadDetail.lastName')} value={lead.lastName} />}
            <Row label={t('crm.email')} value={lead.email ?? '—'} />
            <Row label={t('crm.phone')} value={lead.phone ?? '—'} />
            {lead.company && <Row label={t('crm.company')} value={lead.company} />}
            <Row label={t('crm.source')} value={lead.source ?? '—'} />
            <Row label={t('crm.createdAt')} value={dt(lead.createdAt)} />
            {lead.contactedAt && <Row label={t('leadDetail.contactedAt')} value={dt(lead.contactedAt)} />}
            {lead.qualifiedAt && <Row label={t('leadDetail.clientSince')} value={dt(lead.qualifiedAt)} />}
          </dl>
          {active.length > 0 && (
            <div className="mt-4 border-t border-ink-100 pt-3">
              <div className="mb-2 text-xs font-mono uppercase tracking-wider text-ink-500">
                {t('leadCard.customFields')}
              </div>
              <CustomFieldsView definitions={active} values={lead.customFields} />
            </div>
          )}
        </>
      )}

      <div className="mt-4 border-t border-ink-100 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">{t('leadCard.opportunities')}</div>
          <Link
            href={`/app/opportunities/new?leadId=${lead.id}`}
            className="inline-flex items-center gap-0.5 text-xs text-primary-700 hover:underline"
          >
            <Plus size={11} />
            {t('leadCard.newOpportunity')}
          </Link>
        </div>
        {lead.opportunities.length === 0 ? (
          <p className="mt-2 text-sm text-ink-400">{t('leadDetail.noOpportunities')}</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {lead.opportunities.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <Link
                  href={`/app/opportunities/${o.id}`}
                  className="min-w-0 truncate text-primary-700 hover:underline"
                >
                  {o.name}
                </Link>
                <span className="flex shrink-0 items-center gap-1.5">
                  {o.amount != null && (
                    <span className="text-xs tabular-nums text-ink-500">
                      {Number(o.amount).toLocaleString('es-ES', {
                        style: 'currency',
                        currency: o.currency || 'EUR',
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  )}
                  <Badge color={statusColor(OPP_STATUS_COLOR, o.status)}>
                    {statusLabel(OPP_STATUS, o.status)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="break-words text-right">{value}</dd>
    </div>
  );
}
