import Link from 'next/link';
import { AgentForm } from '../agent-form';
import { AgentPurposeWizard } from './purpose-wizard';
import { isAvailable, purposeMeta } from '@/lib/agent-purposes';
import type { AgentType } from '@converflow/shared';

export const metadata = { title: 'Nuevo agente' };

/**
 * Two-step new-agent flow:
 *  Step 1 (no ?type): funnel grid wizard (15 pieces, 3 available, 12 soon).
 *  Step 2 (?type=X): the form for that purpose — focused, contextual.
 */
export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const meta = type ? purposeMeta(type) : undefined;
  const chosen = meta && isAvailable(meta.type) ? (meta.type as AgentType) : null;

  // Step 1 — funnel grid.
  if (!chosen) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <Link href="/app/agents" className="text-sm text-ink-500 hover:text-ink-900">
            ← Volver a agentes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            ¿Qué quieres automatizar en tu embudo?
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Elige una pieza del embudo. Las marcadas como{' '}
            <span className="font-medium text-emerald-700">✓ Disponible</span> ya están listas
            para usarse.
          </p>
        </div>
        <AgentPurposeWizard />
      </div>
    );
  }

  // Step 2 — contextual form.
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/app/agents/new" className="text-sm text-ink-500 hover:text-ink-900">
          ← Cambiar tipo
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {meta!.icon} {meta!.label}
        </h1>
        <p className="mt-1 text-sm text-ink-500">{meta!.blurb}</p>
      </div>
      <AgentForm initialType={chosen} lockType />
    </div>
  );
}
