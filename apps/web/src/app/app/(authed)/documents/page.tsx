import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { DocumentsTable } from './documents-table';
import { UploadForm } from './upload-form';

interface DocRow {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  client: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
}

export const metadata = { title: 'Documentos' };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; opportunityId?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.clientId) qs.set('clientId', params.clientId);
  if (params.opportunityId) qs.set('opportunityId', params.opportunityId);
  const docs = await serverApiFetch<DocRow[]>(`/documents?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        description="Almacenamiento centralizado de contratos, presupuestos y ficheros comerciales. Cifrado en reposo en Cloudflare R2."
      />

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Subir documento</h2>
        <p className="mt-1 text-xs text-ink-500">
          Máximo 50 MB. Opcional: vincúlalo a un cliente u oportunidad.
        </p>
        <div className="mt-4">
          <UploadForm />
        </div>
      </Card>

      {docs.length === 0 ? (
        <EmptyState
          title="Sin documentos"
          description="Sube contratos, presupuestos o cualquier archivo y vincúlalo a un cliente u oportunidad."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <DocumentsTable docs={docs} />
        </Card>
      )}
    </div>
  );
}
