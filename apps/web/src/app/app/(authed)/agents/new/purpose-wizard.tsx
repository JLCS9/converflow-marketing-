'use client';

import Link from 'next/link';
import {
  AGENT_GROUP_META,
  AGENT_PURPOSES,
  FUNNEL_GROUPS,
  isAvailable,
  type AgentPurposeMeta,
} from '@/lib/agent-purposes';

export function AgentPurposeWizard() {
  const byGroup = FUNNEL_GROUPS.map((g) => ({
    group: g,
    meta: AGENT_GROUP_META[g],
    items: AGENT_PURPOSES.filter((p) => p.group === g),
  }));
  const transversal = AGENT_PURPOSES.filter((p) => p.group === 'TRANSVERSAL');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {byGroup.map(({ group, meta, items }) => (
          <GroupColumn key={group} title={meta.label} items={items} />
        ))}
      </div>
      <GroupRow title={AGENT_GROUP_META.TRANSVERSAL.label} items={transversal} />
      <Legend />
    </div>
  );
}

function GroupColumn({ title, items }: { title: string; items: AgentPurposeMeta[] }) {
  return (
    <div className="space-y-3 rounded-xl bg-emerald-900 p-4 text-white shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="space-y-2">
        {items.map((p) => (
          <PurposeCard key={p.type} meta={p} />
        ))}
      </div>
    </div>
  );
}

function GroupRow({ title, items }: { title: string; items: AgentPurposeMeta[] }) {
  return (
    <div className="space-y-3 rounded-xl bg-ink-700 p-4 text-white shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((p) => (
          <PurposeCard key={p.type} meta={p} />
        ))}
      </div>
    </div>
  );
}

function PurposeCard({ meta }: { meta: AgentPurposeMeta }) {
  const available = isAvailable(meta.type);
  const inner = (
    <div className="flex items-start gap-2">
      <span className="text-lg leading-none">{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-sm font-medium">{meta.label}</span>
          {available ? (
            <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
              ✓ Disponible
            </span>
          ) : (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
              Próximamente
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-white/70">{meta.blurb}</p>
      </div>
    </div>
  );

  if (!available) {
    return (
      <div
        className="block cursor-not-allowed rounded-lg bg-white/5 px-3 py-2 opacity-60"
        title="Próximamente — estamos trabajando en ello"
        aria-disabled
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/app/agents/new?type=${meta.type}`}
      className="block rounded-lg bg-ink-900/50 px-3 py-2 transition-colors hover:bg-ink-900/80 focus:bg-ink-900/80 focus:outline-none"
    >
      {inner}
    </Link>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-ink-500">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-emerald-900" />
        Equipos por etapa del embudo
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-ink-700" />
        Soporte transversal
      </span>
    </div>
  );
}
