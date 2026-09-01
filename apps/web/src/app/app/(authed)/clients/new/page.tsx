import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { CreateClientForm } from './create-form';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('titles.newClient') };
}
export const dynamic = 'force-dynamic';

export default async function NewClientPage() {
  const customFields = await serverApiFetch<CustomFieldDefinition[]>(
    // Lead y Cliente comparten campos personalizados (mismo esquema).
    '/custom-fields?entityType=LEAD',
  ).catch(() => []);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/clients" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo cliente</h1>
      </div>
      <CreateClientForm customFields={customFields} />
    </div>
  );
}
