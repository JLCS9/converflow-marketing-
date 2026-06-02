'use client';

import Link from 'next/link';
import {
  AGENT_TEMPLATES,
  FAMILY_META,
  FUNNEL_STAGE_META,
  VISIBLE_STAGES,
  type AgentTemplate,
} from '@/lib/agent-templates';

/**
 * Funnel wizard rendered straight from AGENT_TEMPLATES. Three stage columns
 * + a transversal row underneath. Cards reuse the rest of the app's design
 * language (white surface, ink border, family accent on the left edge).
 *
 * Click on `available` → /app/agents/new?template=<id>.
 * Click on non-available → no navigation, no form. Just a "Próximamente"
 * tooltip.
 */
export function AgentTemplateWizard() {
  const byStage = VISIBLE_STAGES.map((stage) => ({
    stage,
    meta: FUNNEL_STAGE_META[stage],
    items: AGENT_TEMPLATES.filter((t) => t.funnelStage === stage),
  }));
  const transversal = AGENT_TEMPLATES.filter((t) => t.funnelStage === 'TRANSVERSAL');

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {byStage.map(({ stage, meta, items }) => (
          <section key={stage} className="space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-ink-500">
              {meta.label}
            </h2>
            <div className="space-y-2">
              {items.map((t) => (
                <TemplateCard key={t.id} tpl={t} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="space-y-2 border-t border-ink-100 pt-5">
        <h2 className="text-xs font-mono uppercase tracking-wider text-ink-500">
          {FUNNEL_STAGE_META.TRANSVERSAL.label}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {transversal.map((t) => (
            <TemplateCard key={t.id} tpl={t} />
          ))}
        </div>
      </section>

      <Legend />
    </div>
  );
}

function TemplateCard({ tpl }: { tpl: AgentTemplate }) {
  const fam = FAMILY_META[tpl.family];
  const base =
    'group block rounded-lg border border-ink-100 border-l-4 bg-white px-3 py-2.5 transition-colors';
  const interactive = tpl.available
    ? 'cursor-pointer hover:border-primary-300 hover:shadow-sm focus-visible:border-primary-400 focus-visible:outline-none'
    : 'cursor-not-allowed opacity-60';

  const inner = (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink-900">{tpl.label}</span>
        {tpl.available ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            Disponible
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
            Próximamente
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-ink-500">{tpl.subtitle}</div>
    </div>
  );

  if (!tpl.available) {
    return (
      <div
        className={`${base} ${fam.accent} ${interactive}`}
        title="Próximamente — estamos trabajando en ello"
        aria-disabled
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/app/agents/new?template=${tpl.id}`}
      className={`${base} ${fam.accent} ${interactive}`}
    >
      {inner}
    </Link>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-500">
      {Object.entries(FAMILY_META).map(([key, meta]) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-3 w-1 rounded-sm border-l-2 ${meta.accent}`} />
          {meta.label}
        </span>
      ))}
      <span className="text-ink-400">·</span>
      <span>
        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
          Disponible
        </span>{' '}
        ya usable
      </span>
      <span>
        <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
          Próximamente
        </span>{' '}
        en construcción
      </span>
    </div>
  );
}
