import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, IA_TABS } from '@/components/ui/tab-bar';
import { KnowledgePanel } from './knowledge-panel';
import type { GapRow, InstructionRow, SourceRow, VerifiedRow } from './types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('knowledge.title') };
}
export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const t = await getTranslations('knowledge');
  const [sources, gaps, instructions, verified] = await Promise.all([
    serverApiFetch<SourceRow[]>('/knowledge/sources').catch(() => []),
    serverApiFetch<GapRow[]>('/knowledge/gaps').catch(() => []),
    serverApiFetch<InstructionRow[]>('/knowledge/instructions').catch(() => []),
    serverApiFetch<VerifiedRow[]>('/knowledge/verified').catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <TabBar items={IA_TABS} />
      <PageHeader title={t('title')} description={t('description')} />
      <KnowledgePanel
        initialSources={sources}
        initialGaps={gaps}
        initialInstructions={instructions}
        initialVerified={verified}
      />
    </div>
  );
}
