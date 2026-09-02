import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, IA_TABS } from '@/components/ui/tab-bar';
import { PlaybooksPanel } from './playbooks-panel';
import type { PlaybookRow, RunRow } from './types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('playbooks.title') };
}
export const dynamic = 'force-dynamic';

export default async function PlaybooksPage() {
  const t = await getTranslations('playbooks');
  const [playbooks, drafts] = await Promise.all([
    serverApiFetch<PlaybookRow[]>('/playbooks').catch(() => []),
    serverApiFetch<RunRow[]>('/playbooks/runs?status=DRAFT').catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <TabBar items={IA_TABS} />
      <PageHeader title={t('title')} description={t('description')} />
      <PlaybooksPanel initialPlaybooks={playbooks} initialDrafts={drafts} />
    </div>
  );
}
