import { notFound } from 'next/navigation';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { TemplateForm, type TemplateData } from '../template-form';

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await serverApiFetch<TemplateData>(`/email-templates/${id}`).catch(() => null);
  if (!template) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar plantilla"
        description="Los cambios se reflejan en la vista previa de la derecha."
        back={{ href: '/app/templates', label: 'Plantillas' }}
      />
      <TemplateForm template={template} />
    </div>
  );
}
