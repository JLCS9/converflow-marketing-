import { getTranslations } from 'next-intl/server';
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

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('documents.title') };
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; opportunityId?: string }>;
}) {
  const t = await getTranslations('documents');
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.clientId) qs.set('clientId', params.clientId);
  if (params.opportunityId) qs.set('opportunityId', params.opportunityId);
  const docs = await serverApiFetch<DocRow[]>(`/documents?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          {t('uploadTitle')}
        </h2>
        <p className="mt-1 text-xs text-ink-500">{t('uploadHint')}</p>
        <div className="mt-4">
          <UploadForm />
        </div>
      </Card>

      {docs.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <DocumentsTable docs={docs} />
        </Card>
      )}
    </div>
  );
}
