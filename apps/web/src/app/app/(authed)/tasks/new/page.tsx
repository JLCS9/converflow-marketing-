import Link from 'next/link';
import { CreateTaskForm } from './create-form';

export const metadata = { title: 'Nueva tarea' };

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; clientId?: string; opportunityId?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/tasks" className="text-sm text-ink-500 hover:text-ink-900">← Volver</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nueva tarea</h1>
      </div>
      <CreateTaskForm
        defaultLeadId={params.leadId}
        defaultClientId={params.clientId}
        defaultOpportunityId={params.opportunityId}
      />
    </div>
  );
}
