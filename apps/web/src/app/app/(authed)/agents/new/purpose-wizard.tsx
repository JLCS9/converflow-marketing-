'use client';

import Link from 'next/link';
import {
  AGENT_GROUP_META,
  AGENT_PURPOSES,
  FAMILY_META,
  FUNNEL_GROUPS,
  isAvailable,
  type AgentPurposeMeta,
} from '@/lib/agent-purposes';

/**
 * Funnel wizard — uses the same Card / pill vocabulary as the rest of the
 * app: white surface, ink border, subtle hover. Family is communicated with
 * a 3px left accent + a chip tagline.
 */
export function AgentPurposeWizard() {
  const cols = FUNNEL_GROUPS.map((g) => ({
    group: g,
    meta: AGENT_GROUP_META[g],
    items: AGENT_PURPOSES.filter((p) => p.group === g),
  }));
  const transversal = AGENT_PURPOSES.filter((p) => p.group === 'TRANSVERSAL');

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {cols.map(({ group, meta, items }) => (
          <section key={group} className="space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-ink-500">
              {meta.label}
            </h2>
            <div className="space-y-2">
              {items.map((p) => (
                <PurposeCard key={p.type} meta={p} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="space-y-2 border-t border-ink-100 pt-5">
        <h2 className="text-xs font-mono uppercase tracking-wider text-ink-500">
          {AGENT_GROUP_META.TRANSVERSAL.label}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {transversal.map((p) => (
            <PurposeCard key={p.type} meta={p} />
          ))}
        </div>
      </section>

      <Legend />
    </div>
  );
}

function PurposeCard({ meta }: { meta: AgentPurposeMeta }) {
  const available = isAvailable(meta.type);
  const fam = FAMILY_META[meta.family];

  const base =
    'group block rounded-lg border border-ink-100 border-l-4 bg-white px-3 py-2.5 transition-colors';
  const interactive = available
    ? 'cursor-pointer hover:border-primary-300 hover:shadow-sm focus-visible:border-primary-400 focus-visible:outline-none'
    : 'cursor-not-allowed opacity-60';

  const inner = (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink-900">{meta.label}</span>
        {available ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            Disponible
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
            Próximamente
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-ink-500">{meta.blurb}</div>
    </div>
  );

  if (!available) {
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
    <Link href={`/app/agents/new?type=${meta.type}`} className={`${base} ${fam.accent} ${interactive}`}>
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
