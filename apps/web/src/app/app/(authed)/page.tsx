import { serverApiFetch } from '@/lib/server-api';
import type { OnboardingStep } from '@/components/ui/onboarding-checklist';
import {
  HomeDashboard,
  type Overview,
  type Series,
  type AlertItem,
  type ConvRow,
  type TaskPreview,
  type DocPreview,
} from './home-dashboard';

export const metadata = { title: 'Inicio' };

const EMPTY_SERIES: Series = {
  days: [],
  series: { leadsCreated: [], conversions: [], wonCount: [], wonValue: [], inboundMessages: [] },
  deltas: {
    leadsCreated: { current: 0, previous: 0, pct: null },
    conversions: { current: 0, previous: 0, pct: null },
    wonValue: { current: 0, previous: 0, pct: null },
    inboundMessages: { current: 0, previous: 0, pct: null },
  },
  aiWeek: { attended: 0, suggestions: 0, leadsScored: 0, meetings: 0, escalations: 0, handled: 0, autoResolvedPct: null },
};

export default async function TodayHome() {
  const [overview, series, alerts, convs, tasks, docs, mail, bots, agents, googleStatus, dash] =
    await Promise.all([
      serverApiFetch<Overview>('/reports/overview'),
      serverApiFetch<Series>('/reports/series').catch(() => EMPTY_SERIES),
      serverApiFetch<AlertItem[]>('/alerts').catch(() => [] as AlertItem[]),
      serverApiFetch<ConvRow[]>('/conversations?status=PENDING').catch(() => [] as ConvRow[]),
      serverApiFetch<TaskPreview[]>('/tasks?status=PENDING').catch(() => [] as TaskPreview[]),
      serverApiFetch<DocPreview[]>('/documents').catch(() => [] as DocPreview[]),
      serverApiFetch<{ unread: number }>('/mail/unread-count').catch(() => ({ unread: 0 })),
      serverApiFetch<{ id: string }[]>('/bots').catch(() => [] as { id: string }[]),
      serverApiFetch<{ id: string }[]>('/agents').catch(() => [] as { id: string }[]),
      serverApiFetch<{ connected: boolean }>('/integrations/google/status').catch(() => ({ connected: false })),
      serverApiFetch<{ widgets: { id: string; size?: string }[] | null }>('/me/dashboard').catch(() => ({ widgets: null })),
    ]);

  const steps: OnboardingStep[] = [
    { key: 'bot', label: 'Conecta un canal', description: 'WhatsApp, Email o Web Chat — el sitio donde te van a escribir.', done: bots.length > 0, href: '/app/bots/new', cta: 'Crear bot →' },
    { key: 'agent', label: 'Crea tu primer agente IA', description: 'El asistente que clasifica, propone respuestas y agenda reuniones.', done: agents.length > 0, href: '/app/agents/new', cta: 'Crear agente →' },
    { key: 'lead', label: 'Da de alta un lead o cliente', description: 'Para empezar a trackear conversaciones y oportunidades en el CRM.', done: overview.leads.total > 0 || overview.clients.total > 0, href: '/app/leads/new', cta: 'Nuevo lead →' },
    { key: 'calendar', label: 'Conecta Google Calendar', description: 'Para que tu IA pueda proponer y agendar reuniones.', done: googleStatus.connected, href: '/app/settings', cta: 'Conectar →' },
  ];

  return (
    <HomeDashboard
      data={{ overview, series, alerts, convs, tasks, docs, mailUnread: mail.unread }}
      steps={steps}
      initialWidgets={dash.widgets}
    />
  );
}
