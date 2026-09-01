import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AgentForm } from '../agent-form';
import { OpportunitiesAgentForm } from '../opportunities-agent-form';
import { AgentTemplateWizard } from './purpose-wizard';
import { findTemplate } from '@/lib/agent-templates';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('agents.newTitle') };
}

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
  const t = await getTranslations('agents');
  const { template: tplId } = await searchParams;
  const tpl = findTemplate(tplId);

  // Step 1.
  if (!tpl) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <Link href="/app/agents" className="text-sm text-ink-500 hover:text-ink-900">
            {t('backToAgents')}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {t('wizardTitle')}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t('wizardIntro1')}{' '}
            <span className="font-medium text-emerald-700">{t('availableCheck')}</span>{' '}
            {t('wizardIntro2')}
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
          {t('backChangeType')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{tpl.label}</h1>
        <p className="mt-1 text-sm text-ink-500">{tpl.subtitle}</p>
      </div>
      {tpl.engine === 'OPPORTUNITIES' ? (
        <OpportunitiesAgentForm template={tpl} />
      ) : (
        <AgentForm initialType={tpl.engine} lockType template={tpl} />
      )}
    </div>
  );
}
