import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { ImportLeadsForm } from './import-form';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('titles.importLeads') };
}
export const dynamic = 'force-dynamic';

export default async function ImportLeadsPage() {
  const t = await getTranslations('importCsv');
  const customFields = await serverApiFetch<CustomFieldDefinition[]>(
    '/custom-fields?entityType=LEAD',
  ).catch(() => []);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        back={{ href: '/app/leads', label: t('backToLeads') }}
      />
      <ImportLeadsForm customFields={customFields.filter((c) => !c.archivedAt)} />
      <p className="text-xs text-ink-500">
        {t('footerIntro')}{' '}
        <code className="font-mono">nombre,email,telefono,fuente</code> {t('footerBody')} (
        <code>&quot;Acme, S.L.&quot;</code>).{' '}
        <Link href="/app/leads/new" className="text-primary-700 hover:underline">
          {t('footerCreate')}
        </Link>
        .
      </p>
    </div>
  );
}
