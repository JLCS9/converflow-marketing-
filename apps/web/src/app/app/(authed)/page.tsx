import Link from 'next/link';
import {
  MessageCircle,
  Clock,
  Target,
  Flame,
  ListChecks,
  Bell,
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

export default async function TodayHome() {
  const [data, alerts, convs, bots, agents, googleStatus] = await Promise.all([
    serverApiFetch<Overview>('/reports/overview'),
    serverApiFetch<AlertItem[]>('/alerts').catch(() => [] as AlertItem[]),
    serverApiFetch<ConvRow[]>('/conversations?status=PENDING').catch(() => [] as ConvRow[]),
    serverApiFetch<{ id: string }[]>('/bots').catch(() => [] as { id: string }[]),
    serverApiFetch<{ id: string }[]>('/agents').catch(() => [] as { id: string }[]),
    serverApiFetch<{ connected: boolean }>('/integrations/google/status').catch(() => ({
      connected: false,
    })),
  ]);

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
        <StatCard label="Conversión" value={`${Math.round(data.leads.conversionRate * 100)}%`} hint="Leads convertidos / total" />
        <StatCard label="Leads" value={data.leads.total} hint={`${data.clients.total} clientes`} />
        <StatCard label="Pipeline abierto" value={eur.format(data.opportunities.openValue)} hint={`${eur.format(data.opportunities.wonValue)} ganado`} />
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
