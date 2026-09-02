import { getTranslations } from 'next-intl/server';
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
  type PendingMailRow,
} from './home-dashboard';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('nav.home') };
}

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
  const [overview, series, alerts, convs, tasks, docs, mail, pendingMail, bots, knowledgeSources, googleStatus, dash] =
    await Promise.all([
      serverApiFetch<Overview>('/reports/overview'),
      serverApiFetch<Series>('/reports/series').catch(() => EMPTY_SERIES),
      serverApiFetch<AlertItem[]>('/alerts').catch(() => [] as AlertItem[]),
      serverApiFetch<ConvRow[]>('/conversations?status=PENDING').catch(() => [] as ConvRow[]),
      serverApiFetch<TaskPreview[]>('/tasks?status=PENDING').catch(() => [] as TaskPreview[]),
      serverApiFetch<DocPreview[]>('/documents').catch(() => [] as DocPreview[]),
      serverApiFetch<{ unread: number }>('/mail/unread-count').catch(() => ({ unread: 0 })),
      serverApiFetch<PendingMailRow[]>('/mail/pending').catch(() => [] as PendingMailRow[]),
      serverApiFetch<{ id: string }[]>('/bots').catch(() => [] as { id: string }[]),
      serverApiFetch<{ sourceRef: string }[]>('/knowledge/sources').catch(() => [] as { sourceRef: string }[]),
      serverApiFetch<{ connected: boolean }>('/integrations/google/status').catch(() => ({ connected: false })),
      serverApiFetch<{ widgets: { id: string; size?: string }[] | null }>('/me/dashboard').catch(() => ({ widgets: null })),
    ]);
  const attention = await serverApiFetch<{
    openGaps: number;
    gapsWithLead: number;
    draftPlaybooks: number;
    pendingSuggestions: number;
  }>('/reports/attention').catch(() => null);

  const t = await getTranslations('onboarding');
  const steps: OnboardingStep[] = [
    { key: 'bot', label: t('botLabel'), description: t('botDesc'), done: bots.length > 0, href: '/app/bots/new', cta: t('botCta') },
    { key: 'knowledge', label: t('knowledgeLabel'), description: t('knowledgeDesc'), done: knowledgeSources.length > 0, href: '/app/knowledge', cta: t('knowledgeCta') },
    { key: 'lead', label: t('leadLabel'), description: t('leadDesc'), done: overview.leads.total > 0 || overview.clients.total > 0, href: '/app/leads/new', cta: t('leadCta') },
    { key: 'calendar', label: t('calendarLabel'), description: t('calendarDesc'), done: googleStatus.connected, href: '/app/settings', cta: t('calendarCta') },
  ];

  const tAtt = await getTranslations('attention');
  const attentionItems = attention
    ? [
        attention.gapsWithLead > 0
          ? { href: '/app/knowledge', label: tAtt('gapsWithLead', { n: attention.gapsWithLead }), tone: 'red' as const }
          : attention.openGaps > 0
            ? { href: '/app/knowledge', label: tAtt('openGaps', { n: attention.openGaps }), tone: 'amber' as const }
            : null,
        attention.draftPlaybooks > 0
          ? { href: '/app/playbooks', label: tAtt('drafts', { n: attention.draftPlaybooks }), tone: 'amber' as const }
          : null,
        attention.pendingSuggestions > 0
          ? { href: '/app/conversations', label: tAtt('suggestions', { n: attention.pendingSuggestions }), tone: 'blue' as const }
          : null,
      ].filter((x): x is NonNullable<typeof x> => x != null)
    : [];

  return (
    <>
      {attentionItems.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {attentionItems.map((item) => (
            <a
              key={item.href + item.label}
              href={item.href}
              className={
                item.tone === 'red'
                  ? 'rounded-full bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-200'
                  : item.tone === 'amber'
                    ? 'rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200'
                    : 'rounded-full bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-200'
              }
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
      <HomeDashboard
        data={{ overview, series, alerts, convs, tasks, docs, mailUnread: mail.unread, pendingMail }}
        steps={steps}
        initialWidgets={dash.widgets}
      />
    </>
  );
}
