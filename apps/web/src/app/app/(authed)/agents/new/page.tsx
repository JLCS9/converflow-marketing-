import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AgentForm } from '../agent-form';
import { AgentTemplateWizard } from './purpose-wizard';
import { findTemplate } from '@/lib/agent-templates';

export const metadata = { title: 'Nuevo agente' };

/**
 * Two-step new-agent flow:
 *  Step 1 (no ?template): funnel grid wizard rendered from AGENT_TEMPLATES.
 *  Step 2 (?template=<id>): form for that template's engine, with defaults
 *    prefilled (name, system prompt, tools).
 */
export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template: tplId } = await searchParams;
  const tpl = findTemplate(tplId);

  // Step 1.
  if (!tpl) {
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
            <span className="font-medium text-emerald-700">✓ Disponible</span> ya están
            listas para usarse.
          </p>
        </div>
        <AgentTemplateWizard />
      </div>
    );
  }

  // Step 2: the template must be available — non-available cards never
  // navigate here, but bookmarked URLs / direct hits should land cleanly.
  if (!tpl.available) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/app/agents/new" className="text-sm text-ink-500 hover:text-ink-900">
          ← Cambiar tipo
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{tpl.label}</h1>
        <p className="mt-1 text-sm text-ink-500">{tpl.subtitle}</p>
      </div>
      {/* The opportunities-engine form lands in Commit D; for now both engines
         share the same AgentForm and we pass the template through so the
         next commit can swap it for OpportunitiesAgentForm. */}
      <AgentForm initialType={tpl.engine} lockType template={tpl} />
    </div>
  );
}
