import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { TemplateForm } from '../template-form';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('templates.newTitle') };
}

export default async function NewTemplatePage() {
  const t = await getTranslations('templates');
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('newTitle')}
        description={t('newDescription')}
        back={{ href: '/app/mail/ajustes/plantillas', label: t('listTitle') }}
      />
      <TemplateForm />
    </div>
  );
}
