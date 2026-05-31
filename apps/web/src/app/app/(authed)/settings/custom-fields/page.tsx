import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
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
      <PageHeader
        title="Campos personalizados"
        description="Define los atributos que quieres capturar en tus leads, clientes y oportunidades. Aparecerán automáticamente en los formularios y fichas."
        breadcrumbs={[
          { href: '/app/settings', label: 'Configuración' },
          { label: 'Campos personalizados' },
        ]}
      />
      <Card>
        <CustomFieldsAdmin initial={definitions} />
      </Card>
    </div>
  );
}
