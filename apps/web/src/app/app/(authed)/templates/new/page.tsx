import { PageHeader } from '@/components/ui/page-header';
import { TemplateForm } from '../template-form';

export const metadata = { title: 'Nueva plantilla' };

export default function NewTemplatePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva plantilla"
        description="Diseña el correo con el editor; la vista previa de la derecha muestra cómo se verá."
        back={{ href: '/app/templates', label: 'Plantillas' }}
      />
      <TemplateForm />
    </div>
  );
}
