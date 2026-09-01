import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { CreateLeadForm } from './create-form';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('titles.newLead') };
}
export const dynamic = 'force-dynamic';

export default async function NewLeadPage() {
  const customFields = await serverApiFetch<CustomFieldDefinition[]>(
    '/custom-fields?entityType=LEAD',
  ).catch(() => []);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/leads" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a leads
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo lead</h1>
        <p className="mt-1 text-sm text-ink-500">
          Datos básicos. Los demás campos los enriquecen los agentes IA según interactúa
          con tu equipo.
        </p>
      </div>
      <CreateLeadForm customFields={customFields} />
    </div>
  );
}
