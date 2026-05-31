import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { CreateOpportunityForm } from './create-form';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';
import type { Pipeline } from '../types';

export const metadata = { title: 'Nueva oportunidad' };
export const dynamic = 'force-dynamic';

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; clientId?: string }>;
}) {
  const params = await searchParams;
  const [customFields, pipelines] = await Promise.all([
    serverApiFetch<CustomFieldDefinition[]>('/custom-fields?entityType=OPPORTUNITY').catch(() => []),
    serverApiFetch<Pipeline[]>('/pipelines').catch(() => []),
  ]);

  // If a leadId/clientId is passed in the URL, resolve its name so the form
  // can show it pre-selected instead of an opaque cuid.
  let prefillLead: { id: string; name: string } | null = null;
  let prefillClient: { id: string; name: string } | null = null;

  if (params.leadId) {
    try {
      const lead = await serverApiFetch<{ id: string; name: string }>(`/leads/${params.leadId}`);
      prefillLead = { id: lead.id, name: lead.name };
    } catch {
      /* invalid id — ignore */
    }
  }
  if (params.clientId) {
    try {
      const client = await serverApiFetch<{ id: string; name: string }>(`/clients/${params.clientId}`);
      prefillClient = { id: client.id, name: client.name };
    } catch {
      /* invalid id */
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/opportunities" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nueva oportunidad</h1>
        {prefillLead && (
          <p className="mt-1 text-sm text-ink-500">
            Creando para el lead <strong>{prefillLead.name}</strong>.
          </p>
        )}
        {prefillClient && (
          <p className="mt-1 text-sm text-ink-500">
            Creando para el cliente <strong>{prefillClient.name}</strong>.
          </p>
        )}
      </div>
      <CreateOpportunityForm
        prefillLead={prefillLead}
        prefillClient={prefillClient}
        customFields={customFields}
        pipelines={pipelines}
      />
    </div>
  );
}
