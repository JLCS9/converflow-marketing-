import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { CustomFieldsAdmin } from './custom-fields-admin';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

export const metadata = { title: 'Campos personalizados' };
export const dynamic = 'force-dynamic';

export default async function CustomFieldsSettingsPage() {
  const definitions = await serverApiFetch<CustomFieldDefinition[]>(
    '/custom-fields?includeArchived=true',
  ).catch(() => []);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Campos personalizados</h1>
        <p className="mt-1 text-sm text-ink-500">
          Define los atributos que quieres capturar en tus leads, clientes y oportunidades.
          Aparecerán automáticamente en los formularios y fichas.
        </p>
      </header>
      <Card>
        <CustomFieldsAdmin initial={definitions} />
      </Card>
    </div>
  );
}
