import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, buttonClass } from '@/components/ui/primitives';
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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="mt-1 text-sm text-ink-500">
          Almacenamiento centralizado de contratos, presupuestos, fotos y cualquier fichero
          comercial. Cifrado en reposo en Cloudflare R2. Solo ves los documentos de tu tenant.
        </p>
      </header>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Subir documento</h2>
        <p className="mt-1 text-xs text-ink-500">Máximo 50 MB. Opcional: vincúlalo a un cliente u oportunidad.</p>
        <div className="mt-4">
          <UploadForm />
        </div>
      </Card>

      {docs.length === 0 ? (
        <Card className="text-center text-ink-500">Sin documentos.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <DocumentsTable docs={docs} />
        </Card>
      )}
    </div>
  );
}
