import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { PipelinesAdmin, type Pipeline } from './pipelines-admin';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('settings.pipelines.metaTitle') };
}
export const dynamic = 'force-dynamic';

export default async function PipelinesSettingsPage() {
  const t = await getTranslations('settings');
  const pipelines = await serverApiFetch<Pipeline[]>('/pipelines?includeArchived=true').catch(
    () => [],
  );
  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader
        title={t('pipelines.title')}
        description={t('pipelines.description')}
      />
      <Card>
        <PipelinesAdmin initial={pipelines} />
      </Card>
    </div>
  );
}
