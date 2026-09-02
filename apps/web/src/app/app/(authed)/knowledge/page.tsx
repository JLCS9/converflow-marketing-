import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { IaTabs } from '@/components/ui/ia-tabs';
import { KnowledgePanel } from './knowledge-panel';
import type { GapRow, IdentityView, InstructionRow, RegressionRow, SourceRow, VerticalOption, VerifiedRow } from './types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('knowledge.title') };
}
export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const t = await getTranslations('knowledge');
  const [sources, gaps, instructions, verified, regression, identity, verticals] = await Promise.all([
    serverApiFetch<SourceRow[]>('/knowledge/sources').catch(() => []),
    serverApiFetch<GapRow[]>('/knowledge/gaps').catch(() => []),
    serverApiFetch<InstructionRow[]>('/knowledge/instructions').catch(() => []),
    serverApiFetch<VerifiedRow[]>('/knowledge/verified').catch(() => []),
    serverApiFetch<RegressionRow[]>('/knowledge/regression').catch(() => []),
    serverApiFetch<IdentityView>('/agents/identity').catch(() => null),
    serverApiFetch<VerticalOption[]>('/verticals').catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <IaTabs />
      <PageHeader title={t('title')} description={t('description')} />
      <KnowledgePanel
        initialSources={sources}
        initialGaps={gaps}
        initialInstructions={instructions}
        initialVerified={verified}
        initialRegression={regression}
        identity={identity}
        verticals={verticals}
      />
    </div>
  );
}
