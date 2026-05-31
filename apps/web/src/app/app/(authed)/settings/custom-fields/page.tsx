import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { CustomFieldsAdmin } from './custom-fields-admin';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

export const metadata = { title: 'Campos personalizados' };
export const dynamic = 'force-dynamic';

export default async function CustomFieldsSettingsPage() {
  const definitions = await serverApiFetch<CustomFieldDefinition[]>(
    '/custom-fields?includeArchived=true',
  ).catch(() => []);
  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader
        title="Campos personalizados"
        description="Define los atributos que quieres capturar en tus leads, clientes y oportunidades. Aparecerán automáticamente en los formularios y fichas."
      />
      <Card>
        <CustomFieldsAdmin initial={definitions} />
      </Card>
    </div>
  );
}
