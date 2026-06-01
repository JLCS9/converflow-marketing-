import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { ImportLeadsForm } from './import-form';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

export const metadata = { title: 'Importar leads' };
export const dynamic = 'force-dynamic';

export default async function ImportLeadsPage() {
  const customFields = await serverApiFetch<CustomFieldDefinition[]>(
    '/custom-fields?entityType=LEAD',
  ).catch(() => []);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Importar leads desde CSV"
        description="Sube un .csv y mapea cada columna a un campo estándar o personalizado. Se aceptan separadores , o ; y comillas dobles."
        back={{ href: '/app/leads', label: 'Volver a leads' }}
      />
      <ImportLeadsForm customFields={customFields.filter((c) => !c.archivedAt)} />
      <p className="text-xs text-ink-500">
        ¿No tienes un CSV? Empieza por uno con cabeceras{' '}
        <code className="font-mono">nombre,email,telefono,fuente</code> y un lead por fila. Las
        comillas dobles permiten campos con comas (<code>&quot;Acme, S.L.&quot;</code>).{' '}
        <Link href="/app/leads/new" className="text-primary-700 hover:underline">
          O crea uno a mano
        </Link>
        .
      </p>
    </div>
  );
}
