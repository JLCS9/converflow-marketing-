import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { IaTabs } from '@/components/ui/ia-tabs';
import { PlaybooksPanel } from './playbooks-panel';
import type { PlaybookOptions, PlaybookRow, PlaybookStats, RunRow } from './types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('playbooks.title') };
}
export const dynamic = 'force-dynamic';

export default async function PlaybooksPage() {
  const t = await getTranslations('playbooks');
  const [playbooks, drafts, stats, options] = await Promise.all([
    serverApiFetch<PlaybookRow[]>('/playbooks').catch(() => []),
    serverApiFetch<RunRow[]>('/playbooks/runs?status=DRAFT').catch(() => []),
    serverApiFetch<PlaybookStats>('/playbooks/stats').catch(() => ({}) as PlaybookStats),
    serverApiFetch<PlaybookOptions>('/playbooks/options').catch(() => ({ states: [], events: [] })),
  ]);

  return (
    <div className="space-y-6">
      <IaTabs />
      <PageHeader title={t('title')} description={t('description')} />
      <PlaybooksPanel initialPlaybooks={playbooks} initialDrafts={drafts} stats={stats} options={options} />
    </div>
  );
}
