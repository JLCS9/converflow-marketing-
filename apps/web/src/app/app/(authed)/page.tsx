import Link from 'next/link';
import {
  MessageCircle,
  Clock,
  Target,
  Flame,
  ListChecks,
  Bell,
  FileText,
  Sparkles,
  CalendarCheck,
  Star,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { serverApiFetch } from '@/lib/server-api';
import { Card, StatCard, buttonClass } from '@/components/ui/primitives';
import { OnboardingChecklist, type OnboardingStep } from '@/components/ui/onboarding-checklist';

interface Overview {
  leads: {
    total: number;
    byStatus: { status: string; count: number }[];
    bySource: { source: string; count: number }[];
    conversionRate: number;
  };
  opportunities: { openValue: number; wonValue: number };
  tasks: { pending: number; overdue: number; done: number };
  clients: { total: number; active: number };
}

interface Delta {
  current: number;
  previous: number;
  pct: number | null;
}

interface Series {
  days: string[];
  series: {
    leadsCreated: number[];
    conversions: number[];
    wonCount: number[];
    wonValue: number[];
    inboundMessages: number[];
  };
  deltas: {
    leadsCreated: Delta;
    conversions: Delta;
    wonValue: Delta;
    inboundMessages: Delta;
  };
  aiWeek: {
    attended: number;
    suggestions: number;
    leadsScored: number;
    meetings: number;
    escalations: number;
    handled: number;
    autoResolvedPct: number | null;
  };
}

const EMPTY_SERIES: Series = {
  days: [],
  series: {
    leadsCreated: [],
    conversions: [],
    wonCount: [],
    wonValue: [],
    inboundMessages: [],
  },
  deltas: {
    leadsCreated: { current: 0, previous: 0, pct: null },
    conversions: { current: 0, previous: 0, pct: null },
    wonValue: { current: 0, previous: 0, pct: null },
    inboundMessages: { current: 0, previous: 0, pct: null },
  },
  aiWeek: {
    attended: 0,
    suggestions: 0,
    leadsScored: 0,
    meetings: 0,
    escalations: 0,
    handled: 0,
    autoResolvedPct: null,
  },
};

interface AlertItem {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string | null;
  resourceType: string;
  resourceId: string;
}

interface ConvRow {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  contactJid: string;
  lastMessagePreview: string | null;
}

export const metadata = { title: 'Inicio' };

const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const leadStatusLabel: Record<string, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  QUALIFIED: 'Cualificado',
  CONVERTED: 'Convertido',
  LOST: 'Perdido',
};
const leadStatusColor: Record<string, string> = {
  NEW: 'bg-ink-300',
  CONTACTED: 'bg-blue-400',
  QUALIFIED: 'bg-amber-400',
  CONVERTED: 'bg-green-500',
  LOST: 'bg-red-400',
};

const alertIcon: Record<string, LucideIcon> = {
  LEAD_STALE: Clock,
  OPPORTUNITY_DUE: Target,
  TASK_OVERDUE: ListChecks,
  HIGH_SCORE_LEAD: Flame,
};

const toneChip: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  green: 'bg-green-100 text-green-800',
  gray: 'bg-ink-100 text-ink-500',
};

function severityTone(s: AlertItem['severity']): string {
  return s === 'CRITICAL' ? 'red' : s === 'WARNING' ? 'amber' : 'blue';
}

function resourceHref(a: AlertItem): string {
  if (a.resourceType === 'lead') return `/app/leads/${a.resourceId}`;
  if (a.resourceType === 'opportunity') return `/app/opportunities/${a.resourceId}`;
  return '/app/tasks';
}

function greeting(): string {
  const hour = Number(
    new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }),
  );
  if (hour < 12) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-700">{label}</span>
        <span className="font-mono text-xs text-ink-500">{value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface QueueItem {
  Icon: LucideIcon;
  tone: string;
  title: string;
  meta: string | null;
  href: string;
  action: string;
}

interface TaskPreview {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  lead: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
}

interface DocPreview {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  client: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default async function TodayHome() {
  const [data, series, alerts, convs, bots, agents, googleStatus, tasks, docs] = await Promise.all([
    serverApiFetch<Overview>('/reports/overview'),
    serverApiFetch<Series>('/reports/series').catch(() => EMPTY_SERIES),
    serverApiFetch<AlertItem[]>('/alerts').catch(() => [] as AlertItem[]),
    serverApiFetch<ConvRow[]>('/conversations?status=PENDING').catch(() => [] as ConvRow[]),
    serverApiFetch<{ id: string }[]>('/bots').catch(() => [] as { id: string }[]),
    serverApiFetch<{ id: string }[]>('/agents').catch(() => [] as { id: string }[]),
    serverApiFetch<{ connected: boolean }>('/integrations/google/status').catch(() => ({
      connected: false,
    })),
    serverApiFetch<TaskPreview[]>('/tasks?status=PENDING').catch(() => [] as TaskPreview[]),
    serverApiFetch<DocPreview[]>('/documents').catch(() => [] as DocPreview[]),
  ]);

  const upcomingTasks = tasks.slice(0, 5);
  const recentDocs = docs.slice(0, 5);

  const steps: OnboardingStep[] = [
    {
      key: 'bot',
      label: 'Conecta un canal',
      description: 'WhatsApp, Email o Web Chat — el sitio donde te van a escribir.',
      done: bots.length > 0,
      href: '/app/bots/new',
      cta: 'Crear bot →',
    },
    {
      key: 'agent',
      label: 'Crea tu primer agente IA',
      description: 'El asistente que clasifica, propone respuestas y agenda reuniones.',
      done: agents.length > 0,
      href: '/app/agents/new',
      cta: 'Crear agente →',
    },
    {
      key: 'lead',
      label: 'Da de alta un lead o cliente',
      description: 'Para empezar a trackear conversaciones y oportunidades en el CRM.',
      done: data.leads.total > 0 || data.clients.total > 0,
      href: '/app/leads/new',
      cta: 'Nuevo lead →',
    },
    {
      key: 'calendar',
      label: 'Conecta Google Calendar',
      description: 'Para que tu IA pueda proponer y agendar reuniones.',
      done: googleStatus.connected,
      href: '/app/settings',
      cta: 'Conectar →',
    },
  ];

  const queue: QueueItem[] = [
    ...convs.slice(0, 4).map((c) => ({
      Icon: MessageCircle,
      tone: 'blue',
      title: `${c.contactName || c.contactPhone || 'Contacto'} · sin responder`,
      meta: c.lastMessagePreview,
      href: '/app/conversations',
      action: 'Responder',
    })),
    ...alerts.slice(0, 4).map((a) => ({
      Icon: alertIcon[a.type] ?? Bell,
      tone: severityTone(a.severity),
      title: a.title,
      meta: a.description,
      href: resourceHref(a),
      action: 'Ver',
    })),
  ].slice(0, 6);

  const funnelMax = Math.max(1, ...data.leads.byStatus.map((s) => s.count));
  const sourceMax = Math.max(1, ...data.leads.bySource.map((s) => s.count));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting()} 👋</h1>
        <p className="mt-1 text-sm capitalize text-ink-500">
          {new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      <OnboardingChecklist steps={steps} />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Leads"
          value={data.leads.total}
          hint={`${series.deltas.leadsCreated.current} nuevos esta semana · ${data.clients.total} clientes`}
          spark={series.series.leadsCreated}
          delta={series.deltas.leadsCreated.pct}
        />
        <StatCard
          label="Conversión"
          value={`${Math.round(data.leads.conversionRate * 100)}%`}
          hint={`${series.deltas.conversions.current} convertidos esta semana`}
          spark={series.series.conversions}
          sparkStroke="stroke-green-500"
          delta={series.deltas.conversions.pct}
        />
        <StatCard
          label="Ganado"
          value={eur.format(series.deltas.wonValue.current)}
          hint={`${eur.format(data.opportunities.openValue)} en pipeline abierto · 7 días`}
          spark={series.series.wonValue}
          sparkStroke="stroke-amber-500"
          delta={series.deltas.wonValue.pct}
        />
        <StatCard label="Tareas vencidas" value={data.tasks.overdue} hint={`${data.tasks.pending} pendientes`} />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Tu cola de hoy</h2>
          <span className="font-mono text-xs text-ink-500">
            {queue.length} {queue.length === 1 ? 'prioridad' : 'prioridades'}
          </span>
        </div>
        {queue.length === 0 ? (
          <Card className="text-center text-sm text-ink-500">🎉 Todo al día. Sin pendientes ahora mismo.</Card>
        ) : (
          <div className="space-y-2">
            {queue.map((q, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-ink-100 bg-white p-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneChip[q.tone] ?? toneChip.gray}`}>
                  <q.Icon size={18} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{q.title}</div>
                  {q.meta && <div className="truncate text-xs text-ink-500">{q.meta}</div>}
                </div>
                <Link href={q.href} className={buttonClass('secondary', 'shrink-0')}>
                  {q.action}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Tu trabajo</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-ink-500">
                <ListChecks size={14} strokeWidth={1.75} aria-hidden /> Tareas pendientes
              </h3>
              <Link href="/app/tasks" className="text-xs text-primary-700 hover:underline">
                Ver todas →
              </Link>
            </div>
            {upcomingTasks.length === 0 ? (
              <p className="text-sm text-ink-500">Sin tareas pendientes. 🎉</p>
            ) : (
              <ul className="space-y-1.5">
                {upcomingTasks.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <Link
                      href={`/app/tasks`}
                      className="min-w-0 flex-1 truncate text-ink-900 hover:text-primary-700"
                      title={t.title}
                    >
                      {t.title}
                    </Link>
                    <span className="shrink-0 font-mono text-[11px] text-ink-500">
                      {t.dueAt
                        ? new Date(t.dueAt).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                          })
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-ink-500">
                <FileText size={14} strokeWidth={1.75} aria-hidden /> Documentos recientes
              </h3>
              <Link href="/app/documents" className="text-xs text-primary-700 hover:underline">
                Ver todos →
              </Link>
            </div>
            {recentDocs.length === 0 ? (
              <p className="text-sm text-ink-500">
                Sin documentos.{' '}
                <Link href="/app/documents" className="text-primary-700 hover:underline">
                  Sube el primero
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-1.5">
                {recentDocs.map((d) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <Link
                      href="/app/documents"
                      className="min-w-0 flex-1 truncate text-ink-900 hover:text-primary-700"
                      title={d.name}
                    >
                      {d.name}
                    </Link>
                    <span className="shrink-0 font-mono text-[11px] text-ink-500">
                      {formatBytes(d.sizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles size={16} strokeWidth={1.75} className="text-primary-600" aria-hidden /> Tu IA esta semana
          </h2>
          <span className="font-mono text-xs text-ink-500">últimos 7 días</span>
        </div>
        {series.aiWeek.handled === 0 &&
        series.aiWeek.leadsScored === 0 &&
        series.aiWeek.meetings === 0 ? (
          <Card className="text-center text-sm text-ink-500">
            Tu IA aún no ha actuado esta semana. En cuanto entren conversaciones o puntúes leads, lo verás aquí.
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  Icon: MessageCircle,
                  label: 'Conversaciones atendidas',
                  value: series.aiWeek.attended,
                  hint:
                    series.aiWeek.autoResolvedPct !== null
                      ? `${Math.round(series.aiWeek.autoResolvedPct * 100)}% resueltas sin intervención`
                      : `${series.aiWeek.suggestions} sugerencias generadas`,
                },
                {
                  Icon: Star,
                  label: 'Leads puntuados',
                  value: series.aiWeek.leadsScored,
                  hint: 'Lead scoring con IA',
                },
                {
                  Icon: CalendarCheck,
                  label: 'Reuniones agendadas',
                  value: series.aiWeek.meetings,
                  hint: 'Por el agente',
                },
                {
                  Icon: UserCog,
                  label: 'Escaladas a humano',
                  value: series.aiWeek.escalations,
                  hint: 'Casos derivados',
                },
              ].map((t) => (
                <div key={t.label} className="rounded-lg border border-ink-100 bg-white p-5">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink-500">
                    <t.Icon size={14} strokeWidth={1.75} aria-hidden /> {t.label}
                  </div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight">{t.value}</div>
                  <div className="mt-1 text-xs text-ink-500">{t.hint}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-400">
              Las respuestas automáticas incluyen un aviso de IA.{' '}
              <Link href="/ai-disclosure" className="hover:underline">
                Más info
              </Link>
              .
            </p>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Pulso del negocio</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="text-sm font-mono uppercase tracking-wider text-ink-500">Embudo de leads</h3>
            <div className="mt-4 space-y-3">
              {data.leads.byStatus.map((s) => (
                <Bar
                  key={s.status}
                  label={leadStatusLabel[s.status] ?? s.status}
                  value={s.count}
                  max={funnelMax}
                  color={leadStatusColor[s.status] ?? 'bg-ink-300'}
                />
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-mono uppercase tracking-wider text-ink-500">Leads por fuente</h3>
            <div className="mt-4 space-y-3">
              {data.leads.bySource.length === 0 ? (
                <p className="text-sm text-ink-500">Sin datos de fuente.</p>
              ) : (
                data.leads.bySource.map((s) => (
                  <Bar key={s.source} label={s.source} value={s.count} max={sourceMax} color="bg-primary-500" />
                ))
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
