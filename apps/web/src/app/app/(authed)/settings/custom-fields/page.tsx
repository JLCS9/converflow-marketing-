import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { CustomFieldsAdmin } from './custom-fields-admin';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('settings.customFields.title') };
}
export const dynamic = 'force-dynamic';

export default async function CustomFieldsSettingsPage() {
  const t = await getTranslations('settings');
  const definitions = await serverApiFetch<CustomFieldDefinition[]>(
    '/custom-fields?includeArchived=true',
  ).catch(() => []);
  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader
        title={t('customFields.title')}
        description={t('customFields.description')}
      />
      <Card>
        <CustomFieldsAdmin initial={definitions} />
      </Card>
    </div>
  );
}
