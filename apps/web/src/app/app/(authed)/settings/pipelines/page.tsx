import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PipelinesAdmin, type Pipeline } from './pipelines-admin';

export const metadata = { title: 'Tableros' };
export const dynamic = 'force-dynamic';

export default async function PipelinesSettingsPage() {
  const pipelines = await serverApiFetch<Pipeline[]>('/pipelines?includeArchived=true').catch(
    () => [],
  );
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tableros de oportunidades</h1>
        <p className="mt-1 text-sm text-ink-500">
          Define los procesos de venta que necesitas. Cada oportunidad vive en un tablero
          y se mueve entre sus etapas.
        </p>
      </header>
      <Card>
        <PipelinesAdmin initial={pipelines} />
      </Card>
    </div>
  );
}
