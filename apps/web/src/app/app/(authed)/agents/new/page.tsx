import Link from 'next/link';
import { AgentForm, type AgentType } from '../agent-form';

export const metadata = { title: 'Nuevo agente' };

const ALLOWED: AgentType[] = ['CONVERSATIONAL', 'SCORING', 'TRIAGE'];

export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const initial = (ALLOWED as string[]).includes(type ?? '')
    ? (type as AgentType)
    : 'CONVERSATIONAL';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/app/agents" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a agentes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo agente</h1>
        <p className="mt-1 text-sm text-ink-500">
          Elige el tipo (Conversacional para chat, Scoring para procesar leads en masa).
          Tras crearlo podrás probarlo y, si es Conversacional, asignarlo a un bot.
        </p>
      </div>
      <AgentForm initialType={initial} />
    </div>
  );
}
