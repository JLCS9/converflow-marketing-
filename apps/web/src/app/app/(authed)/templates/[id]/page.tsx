import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { TemplateForm, type TemplateData } from '../template-form';

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations('templates');
  const { id } = await params;
  const template = await serverApiFetch<TemplateData>(`/email-templates/${id}`).catch(() => null);
  if (!template) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('editTitle')}
        description={t('editDescription')}
        back={{ href: '/app/mail/ajustes/plantillas', label: t('listTitle') }}
      />
      <TemplateForm template={template} />
    </div>
  );
}
