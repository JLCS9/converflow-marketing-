import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { AgentForm, type AgentData } from '../agent-form';
import { AgentPlayground } from '../agent-playground';

export const metadata = { title: 'Agente' };

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let agent: AgentData;
  try {
    agent = await serverApiFetch<AgentData>(`/agents/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/app/agents" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a agentes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{agent.name}</h1>
      </div>
      <AgentForm agent={agent} />
      <AgentPlayground agentId={agent.id} />
    </div>
  );
}
