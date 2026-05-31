import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { PipelinesAdmin, type Pipeline } from './pipelines-admin';

export const metadata = { title: 'Tableros' };
export const dynamic = 'force-dynamic';

export default async function PipelinesSettingsPage() {
  const pipelines = await serverApiFetch<Pipeline[]>('/pipelines?includeArchived=true').catch(
    () => [],
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableros de oportunidades"
        description="Define los procesos de venta que necesitas. Cada oportunidad vive en un tablero y se mueve entre sus etapas."
        breadcrumbs={[
          { href: '/app/settings', label: 'Configuración' },
          { label: 'Tableros' },
        ]}
      />
      <Card>
        <PipelinesAdmin initial={pipelines} />
      </Card>
    </div>
  );
}
