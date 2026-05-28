import Link from 'next/link';
import { AgentForm } from '../agent-form';

export const metadata = { title: 'Nuevo agente' };

export default function NewAgentPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/app/agents" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a agentes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo agente</h1>
        <p className="mt-1 text-sm text-ink-500">
          Tras crearlo podrás probarlo en el playground y asignarlo a un bot.
        </p>
      </div>
      <AgentForm />
    </div>
  );
}
