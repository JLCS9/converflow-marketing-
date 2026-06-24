import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TemplateActions } from './template-actions';

interface TemplateRow {
  id: string;
  name: string;
  subject: string | null;
  updatedAt: string;
}

export const metadata = { title: 'Plantillas de email' };

export default async function TemplatesPage() {
  const templates = await serverApiFetch<TemplateRow[]>('/email-templates').catch(
    () => [] as TemplateRow[],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plantillas de email"
        description="Plantillas HTML reutilizables en el compositor de conversaciones y en las campañas."
        action={
          <Link href="/app/templates/new" className={buttonClass('primary')}>
            + Nueva plantilla
          </Link>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          title="Sin plantillas"
          description="Crea tu primera plantilla de email para reutilizarla en respuestas y campañas."
          cta={
            <Link href="/app/templates/new" className={buttonClass('primary', 'text-xs')}>
              + Nueva plantilla
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="hidden px-4 py-3 md:table-cell">Asunto</th>
                <th className="hidden px-4 py-3 md:table-cell">Actualizada</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/app/templates/${t.id}`} className="hover:text-primary-700">
                      {t.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-ink-600 md:table-cell">{t.subject ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-xs text-ink-500 md:table-cell">
                    {new Date(t.updatedAt).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TemplateActions id={t.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
