'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Building2,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Mail,
  Megaphone,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Badge, Card, Field, Input, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/inbox-kit';
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

const OPEN_OPP_STATUSES = new Set(['OPEN', 'QUOTED', 'NEGOTIATING']);

function scoreTone(score: number | null): string {
  if (score == null) return 'bg-ink-100 text-ink-500';
  if (score >= 75) return 'bg-green-100 text-green-800';
  if (score >= 50) return 'bg-yellow-100 text-yellow-800';
  if (score >= 25) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

const STATUS_PILL: Record<string, { on: string; off: string }> = {
  LEAD: { on: 'bg-blue-600 text-white', off: 'text-blue-700 hover:bg-blue-50' },
  CLIENT: { on: 'bg-green-600 text-white', off: 'text-green-700 hover:bg-green-50' },
  LOST: { on: 'bg-red-600 text-white', off: 'text-red-700 hover:bg-red-50' },
};

const dt = (iso: string) => new Date(iso).toLocaleDateString('es-ES');

function money(amount: string | null, currency?: string): string | null {
  if (amount == null) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  try {
    return n.toLocaleString('es-ES', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
    });
  } catch {
    return `${amount} ${currency ?? ''}`.trim();
  }
}

/**
 * Tarjeta canónica del lead (Bloque 3). Única fuente de UI para el detalle:
 * la página /app/leads/[id] y el drawer de las bandejas renderizan ESTE
 * componente. Cabecera con lo accionable (estado, score, oportunidades
 * abiertas) y debajo información (2/3) + comentarios y actividad (1/3).
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
  /** true en el drawer: sin nombre en el hero (lo pone el drawer) y zonas apiladas. */
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
      <Hero lead={lead} compact={compact} onChanged={refresh} />
      <div className={compact ? 'space-y-4' : 'grid items-start gap-4 lg:grid-cols-3'}>
        <div className={compact ? '' : 'lg:col-span-2'}>
          <InfoZone lead={lead} definitions={definitions} onChanged={refresh} />
        </div>
        <div className="space-y-4">
          <Card className="flex max-h-[30rem] flex-col">
            <h2 className="mb-3 text-sm font-mono uppercase tracking-wider text-ink-500">
              {t('comments')}
            </h2>
            <LeadNotes leadId={lead.id} notes={lead.notes} onChanged={refresh} />
          </Card>
          <Card className="max-h-[26rem] overflow-y-auto">
            <h2 className="mb-3 text-sm font-mono uppercase tracking-wider text-ink-500">
              {t('activity')}
            </h2>
            <LeadTimeline events={timeline} />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---- cabecera: identidad + estado + score + oportunidades abiertas --------

function Hero({
  lead,
  compact,
  onChanged,
}: {
  lead: LeadCardData;
  compact: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [aiOpen, setAiOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fullName = [lead.name, lead.lastName].filter(Boolean).join(' ');
  const openOpps = lead.opportunities.filter((o) => OPEN_OPP_STATUSES.has(o.status));

  function setStatus(status: string) {
    if (status === lead.status || pending) return;
    startTransition(async () => {
      try {
        await apiFetch(`/leads/${lead.id}`, { method: 'PATCH', json: { status } });
        toast.success('Estado actualizado');
        onChanged();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar');
      }
    });
  }

  function recalcScore() {
    setError(null);
    startTransition(async () => {
      try {
        await apiFetch(`/leads/${lead.id}/score`, { method: 'POST' });
        onChanged();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    });
  }

  async function removeLead() {
    const ok = await confirm({
      title: `Eliminar permanentemente${fullName ? ` "${fullName}"` : ' este lead'}`,
      description: (
        <div className="space-y-3">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <strong>{t('leadDetail.deleteIrreversible')}</strong> Se procesa como una solicitud de
            supresión y borra los datos sin posibilidad de recuperación.
          </div>
          <p>{t('leadDetail.deleteIntro')}</p>
          <ul className="ml-4 list-disc space-y-1 text-xs text-ink-700">
            <li>{t('leadDetail.deleteIdentity')}</li>
            <li>{t('leadDetail.deleteCustomFields')}</li>
            <li>{t('leadDetail.deleteNotes')}</li>
            <li>{t('leadDetail.deleteOpps')}</li>
            <li>{t('leadDetail.deleteConversations')}</li>
          </ul>
          <p className="text-xs text-ink-500">
            El registro de auditoría de la cuenta conserva una entrada técnica de esta supresión
            sin datos personales, conforme al artículo 17 del RGPD.
          </p>
        </div>
      ),
      confirmLabel: 'Eliminar permanentemente',
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/leads/${lead.id}`, { method: 'DELETE' });
      toast.success('Lead eliminado permanentemente');
      router.replace('/app/contacts');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar');
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
        {!compact && (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={fullName || '?'} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight tracking-tight text-ink-900">
                {fullName}
              </h1>
              {(lead.company || lead.source) && (
                <div className="mt-0.5 truncate text-xs text-ink-500">
                  {[lead.company, lead.source && `${t('crm.source').toLowerCase()}: ${lead.source}`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Estado como selector de píldoras: lo que define el tipo de contacto. */}
        <div className="flex rounded-full border border-ink-100 bg-ink-100/50 p-0.5" role="group" aria-label={t('crm.status')}>
          {LEAD_STATUS_OPTIONS.map((o) => {
            const active = lead.status === o.value;
            const tone = STATUS_PILL[o.value] ?? { on: 'bg-ink-900 text-white', off: 'text-ink-600 hover:bg-ink-100' };
            return (
              <button
                key={o.value}
                type="button"
                disabled={pending}
                onClick={() => setStatus(o.value)}
                aria-pressed={active}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${active ? tone.on : tone.off}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums ${scoreTone(lead.score)}`}
          >
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">
              {t('leadDetail.aiScore')}
            </span>
            {lead.score != null ? lead.score : '—'}
          </span>
          <button
            type="button"
            onClick={() => setAiOpen((v) => !v)}
            className={buttonClass('secondary', 'inline-flex items-center gap-1 px-2 py-1 text-xs')}
          >
            <Sparkles size={12} />
            {t('leadCard.aiAnalysis')}
            {aiOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {!compact && (
            <button
              type="button"
              onClick={() => void removeLead()}
              aria-label={t('leadCard.deleteLead')}
              title={t('leadCard.deleteLead')}
              className="rounded-md p-1.5 text-ink-300 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Lo más relevante a primera vista: oportunidades abiertas. */}
      {openOpps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 bg-amber-50/50 px-4 py-2.5 sm:px-5">
          <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber-700">
            <Target size={12} />
            {t('leadCard.openOpportunities')}
          </span>
          {openOpps.map((o) => (
            <Link
              key={o.id}
              href={`/app/opportunities/${o.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-800 shadow-sm transition-colors hover:border-amber-400"
            >
              {o.name}
              {money(o.amount, o.currency) && (
                <span className="font-semibold text-amber-700">{money(o.amount, o.currency)}</span>
              )}
              <span className="text-[10px] text-ink-400">{statusLabel(OPP_STATUS, o.status)}</span>
            </Link>
          ))}
        </div>
      )}

      {aiOpen && (
        <div className="border-t border-ink-100 px-4 py-3 text-sm sm:px-5">
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
              {lead.aiScoredAt && (
                <p className="text-xs text-ink-400">
                  {t('leadCard.lastAnalysis')}: {new Date(lead.aiScoredAt).toLocaleString('es-ES')}
                </p>
              )}
            </div>
          ) : (
            <p className="text-ink-500">{t('leadCard.noAiAnalysis')}</p>
          )}
          <div className="mt-3">
            <button
              type="button"
              disabled={pending}
              onClick={recalcScore}
              className={buttonClass(lead.score != null ? 'secondary' : 'primary', 'text-xs')}
            >
              {pending
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

// ---- zona información: fichas con icono + campos personalizados ----------

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
  const [form, setForm] = useState({ name: '', lastName: '', email: '', phone: '', source: '' });
  const [cfDraft, setCfDraft] = useState<Record<string, unknown>>({});

  function startEdit() {
    setForm({
      name: lead.name,
      lastName: lead.lastName ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      source: lead.source ?? '',
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
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          {t('leadDetail.info')}
        </h2>
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
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder={t('leadDetail.sourcePlaceholder')}
              />
            </Field>
          </div>
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
          <button type="button" className={buttonClass('primary', 'text-xs')} onClick={save} disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <InfoTile
              icon={Mail}
              label={t('crm.email')}
              value={lead.email}
              href={lead.email ? `mailto:${lead.email}` : undefined}
            />
            <InfoTile
              icon={Phone}
              label={t('crm.phone')}
              value={lead.phone}
              href={lead.phone ? `tel:${lead.phone}` : undefined}
            />
            {lead.company && <InfoTile icon={Building2} label={t('crm.company')} value={lead.company} />}
            <InfoTile icon={Megaphone} label={t('crm.source')} value={lead.source} />
            <InfoTile icon={CalendarPlus} label={t('crm.createdAt')} value={dt(lead.createdAt)} />
            {lead.contactedAt && (
              <InfoTile icon={PhoneCall} label={t('leadDetail.contactedAt')} value={dt(lead.contactedAt)} />
            )}
            {lead.qualifiedAt && (
              <InfoTile icon={UserCheck} label={t('leadDetail.clientSince')} value={dt(lead.qualifiedAt)} />
            )}
          </div>
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
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('leadCard.opportunities')}
          </div>
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
          <ul className="mt-2 divide-y divide-ink-100/70 text-sm">
            {lead.opportunities.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-1.5">
                <Link
                  href={`/app/opportunities/${o.id}`}
                  className="min-w-0 truncate text-primary-700 hover:underline"
                >
                  {o.name}
                </Link>
                <span className="flex shrink-0 items-center gap-1.5">
                  {money(o.amount, o.currency) && (
                    <span className="text-xs tabular-nums text-ink-500">{money(o.amount, o.currency)}</span>
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

function InfoTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  href?: string;
}) {
  const content = value ?? '—';
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-ink-100 bg-ink-100/25 px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-ink-400 shadow-sm">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
        {href && value ? (
          <a href={href} className="block truncate text-sm text-primary-700 hover:underline">
            {content}
          </a>
        ) : (
          <div className="truncate text-sm text-ink-900">{content}</div>
        )}
      </div>
    </div>
  );
}
