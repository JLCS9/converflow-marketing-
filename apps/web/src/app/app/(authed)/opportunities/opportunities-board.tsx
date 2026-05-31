'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { OppCard, Pipeline, PipelineStage } from './types';

interface Props {
  pipeline: Pipeline;
  initialOpps: OppCard[];
}

export function OpportunitiesBoard({ pipeline, initialOpps }: Props) {
  const router = useRouter();
  const [opps, setOpps] = useState(initialOpps);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStageId, setHoverStageId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stages = useMemo(
    () => [...pipeline.stages].sort((a, b) => a.order - b.order),
    [pipeline.stages],
  );

  const byStage = useMemo(() => {
    const m: Record<string, OppCard[]> = {};
    for (const s of stages) m[s.id] = [];
    for (const o of opps) {
      if (o.stageId && m[o.stageId]) m[o.stageId]!.push(o);
    }
    return m;
  }, [opps, stages]);

  const sums = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of stages) {
      m[s.id] = (byStage[s.id] ?? []).reduce(
        (acc, o) => acc + (o.amount ? Number(o.amount) : 0),
        0,
      );
    }
    return m;
  }, [byStage, stages]);

  async function move(oppId: string, toStage: PipelineStage) {
    const opp = opps.find((o) => o.id === oppId);
    if (!opp || opp.stageId === toStage.id) return;
    const prev = opps;
    setOpps((arr) =>
      arr.map((o) =>
        o.id === oppId
          ? { ...o, stageId: toStage.id, stage: toStage }
          : o,
      ),
    );
    setErr(null);
    try {
      await apiFetch(`/opportunities/${oppId}`, {
        method: 'PATCH',
        json: { stageId: toStage.id },
      });
      router.refresh();
    } catch (e) {
      setOpps(prev);
      setErr(e instanceof ApiError ? e.message : 'No se pudo mover la oportunidad');
    }
  }

  // Mobile: single-stage view with selector
  const [mobileStageId, setMobileStageId] = useState<string>(stages[0]?.id ?? '');

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}

      {/* Mobile single-column view with selector */}
      <div className="md:hidden">
        <label className="block">
          <span className="text-xs text-ink-500">Etapa</span>
          <select
            className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm"
            value={mobileStageId}
            onChange={(e) => setMobileStageId(e.target.value)}
            aria-label="Elegir etapa"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({(byStage[s.id] ?? []).length})
              </option>
            ))}
          </select>
        </label>
        {(() => {
          const s = stages.find((x) => x.id === mobileStageId);
          if (!s) return null;
          const cards = byStage[s.id] ?? [];
          return (
            <div className="mt-3 space-y-2">
              <div
                className="rounded-md px-3 py-2 text-xs font-medium text-white"
                style={{ backgroundColor: s.color }}
              >
                <div className="flex items-center justify-between">
                  <span>{s.label}</span>
                  <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                    {cards.length}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] opacity-90">
                  {sums[s.id]
                    ? `${Number(sums[s.id]).toLocaleString('es-ES')} €`
                    : '—'}
                </div>
              </div>
              {cards.length === 0 ? (
                <p className="rounded border border-dashed border-ink-200 p-4 text-center text-xs text-ink-400">
                  Sin oportunidades en esta etapa.
                </p>
              ) : (
                cards.map((o) => (
                  <article key={o.id} className="rounded-md border border-ink-100 bg-white p-3 text-sm shadow-sm">
                    <Link
                      href={`/app/opportunities/${o.id}`}
                      className="block font-medium text-ink-900 hover:text-primary-700"
                    >
                      {o.name}
                    </Link>
                    <div className="mt-1 text-xs text-ink-500">
                      {o.client?.name ?? o.lead?.name ?? '—'}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">
                        {o.amount
                          ? `${Number(o.amount).toLocaleString('es-ES')} ${o.currency}`
                          : '—'}
                      </span>
                      <select
                        aria-label="Mover a otra etapa"
                        className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[11px]"
                        value={o.stageId ?? ''}
                        onChange={(e) => {
                          const next = stages.find((x) => x.id === e.target.value);
                          if (next) void move(o.id, next);
                        }}
                      >
                        {stages.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))
              )}
            </div>
          );
        })()}
      </div>

      {/* Desktop kanban */}
      <div className="hidden auto-cols-[260px] grid-flow-col gap-3 overflow-x-auto pb-2 md:grid">
        {stages.map((stage) => {
          const cards = byStage[stage.id] ?? [];
          const isHover = hoverStageId === stage.id;
          return (
            <div
              key={stage.id}
              className={`flex max-h-[70vh] flex-col rounded-lg border bg-white transition-colors ${
                isHover ? 'border-primary-400 bg-primary-50/50' : 'border-ink-100'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverStageId(stage.id);
              }}
              onDragLeave={() => setHoverStageId((s) => (s === stage.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setHoverStageId(null);
                if (draggingId) void move(draggingId, stage);
              }}
            >
              <div
                className="rounded-t-lg px-3 py-2 text-xs font-medium text-white"
                style={{ backgroundColor: stage.color }}
              >
                <div className="flex items-center justify-between">
                  <span>{stage.label}</span>
                  <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                    {cards.length}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] opacity-90">
                  {sums[stage.id]
                    ? `${Number(sums[stage.id]).toLocaleString('es-ES')} €`
                    : '—'}
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {cards.length === 0 ? (
                  <p className="rounded border border-dashed border-ink-200 p-3 text-center text-[11px] text-ink-400">
                    Suelta aquí
                  </p>
                ) : (
                  cards.map((o) => (
                    <article
                      key={o.id}
                      draggable
                      onDragStart={() => setDraggingId(o.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setHoverStageId(null);
                      }}
                      className={`group cursor-grab rounded-md border bg-white p-2.5 text-sm shadow-sm transition-all hover:shadow ${
                        draggingId === o.id ? 'opacity-50' : 'border-ink-100'
                      }`}
                    >
                      <Link
                        href={`/app/opportunities/${o.id}`}
                        className="block font-medium text-ink-900 hover:text-primary-700"
                      >
                        {o.name}
                      </Link>
                      <div className="mt-1 text-xs text-ink-500">
                        {o.client?.name ?? o.lead?.name ?? '—'}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="font-mono text-xs">
                          {o.amount
                            ? `${Number(o.amount).toLocaleString('es-ES')} ${o.currency}`
                            : '—'}
                        </span>
                        {o.expectedCloseDate && (
                          <span className="text-[10px] text-ink-400">
                            {new Date(o.expectedCloseDate).toLocaleDateString('es-ES')}
                          </span>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
