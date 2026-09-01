import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { AgentForm, type AgentData } from '../agent-form';
import { AgentPlayground } from '../agent-playground';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('agents.detailTitle') };
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations('agents');
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
          {t('backToAgents')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{agent.name}</h1>
      </div>
      <AgentForm agent={agent} />
      <AgentPlayground agentId={agent.id} />
    </div>
  );
}
