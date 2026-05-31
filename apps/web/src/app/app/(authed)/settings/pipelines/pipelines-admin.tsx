'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Field, Input, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

export interface PipelineStage {
  id?: string;
  key: string;
  label: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  entityType: 'OPPORTUNITY';
  isDefault: boolean;
  archivedAt: string | null;
  stages: PipelineStage[];
}

const DEFAULT_NEW_STAGES: PipelineStage[] = [
  { key: 'OPEN', label: 'Inicio', color: '#64748B', order: 0, isWon: false, isLost: false },
  { key: 'QUALIFIED', label: 'Cualificada', color: '#3B82F6', order: 1, isWon: false, isLost: false },
  { key: 'WON', label: 'Ganada', color: '#16A34A', order: 2, isWon: true, isLost: false },
  { key: 'LOST', label: 'Perdida', color: '#DC2626', order: 3, isWon: false, isLost: true },
];

export function PipelinesAdmin({ initial }: { initial: Pipeline[] }) {
  const router = useRouter();
  const [pipelines, setPipelines] = useState(initial);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const next = await apiFetch<Pipeline[]>('/pipelines?includeArchived=true');
    setPipelines(next);
    router.refresh();
  }

  const active = pipelines.filter((p) => !p.archivedAt);
  const archived = pipelines.filter((p) => p.archivedAt);

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-xs text-ink-500">
          El tablero por defecto se usa para oportunidades nuevas si no eliges otro.
        </p>
        <button
          type="button"
          className={buttonClass('primary', 'text-xs px-3 py-1.5')}
          onClick={() => setCreating(true)}
        >
          + Nuevo tablero
        </button>
      </div>

      {creating && (
        <PipelineEditor
          mode="create"
          initial={{ name: 'Tablero nuevo', isDefault: false, stages: DEFAULT_NEW_STAGES }}
          onCancel={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await refresh();
          }}
        />
      )}

      <div className="space-y-3">
        {active.map((p) => (
          <PipelineCard key={p.id} pipeline={p} onChanged={refresh} />
        ))}
      </div>

      {archived.length > 0 && (
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">
            Archivados
          </h3>
          <div className="mt-2 space-y-2">
            {archived.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-ink-100 bg-ink-50 px-3 py-2 text-sm"
              >
                <span className="text-ink-500">{p.name}</span>
                <button
                  type="button"
                  className="text-xs text-primary-700 hover:underline"
                  onClick={async () => {
                    await apiFetch(`/pipelines/${p.id}`, {
                      method: 'PATCH',
                      json: { archived: false },
                    });
                    await refresh();
                  }}
                >
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineCard({
  pipeline,
  onChanged,
}: {
  pipeline: Pipeline;
  onChanged: () => Promise<void> | void;
}) {
  const { confirm, toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-md border border-ink-100 bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
            {pipeline.name}
            {pipeline.isDefault && (
              <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                Por defecto
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {pipeline.stages.map((s) => (
              <span
                key={s.key}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-white"
                style={{ backgroundColor: s.color }}
                title={`${s.label}${s.isWon ? ' · ganada' : s.isLost ? ' · perdida' : ''}`}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-ink-600 hover:text-ink-900"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? 'Cerrar' : 'Editar'}
          </button>
          {!pipeline.isDefault && (
            <button
              type="button"
              className="text-xs text-red-600 hover:underline"
              onClick={async () => {
                const ok = await confirm({
                  title: `Archivar "${pipeline.name}"`,
                  description: 'Las oportunidades que vivan en este tablero seguirán existiendo, pero el tablero dejará de aparecer.',
                  confirmLabel: 'Archivar',
                  danger: true,
                });
                if (!ok) return;
                try {
                  await apiFetch(`/pipelines/${pipeline.id}`, {
                    method: 'PATCH',
                    json: { archived: true },
                  });
                  toast.success('Tablero archivado');
                  await onChanged();
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : 'No se pudo archivar');
                }
              }}
            >
              Archivar
            </button>
          )}
        </div>
      </div>
      {editing && (
        <PipelineEditor
          mode="edit"
          pipelineId={pipeline.id}
          initial={pipeline}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function PipelineEditor({
  mode,
  pipelineId,
  initial,
  onCancel,
  onSaved,
}: {
  mode: 'create' | 'edit';
  pipelineId?: string;
  initial: { name: string; isDefault: boolean; stages: PipelineStage[] };
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState(initial.name);
  const [isDefault, setIsDefault] = useState(initial.isDefault);
  const [stages, setStages] = useState<PipelineStage[]>(initial.stages);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function updateStage(i: number, patch: Partial<PipelineStage>) {
    setStages((arr) => arr.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function moveStage(i: number, dir: -1 | 1) {
    setStages((arr) => {
      const next = [...arr];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      const target = next[j]!;
      const current = next[i]!;
      next[j] = current;
      next[i] = target;
      return next.map((s, idx) => ({ ...s, order: idx }));
    });
  }
  function removeStage(i: number) {
    setStages((arr) => arr.filter((_, j) => j !== i).map((s, idx) => ({ ...s, order: idx })));
  }
  function addStage() {
    setStages((arr) => [
      ...arr,
      {
        key: `STAGE_${arr.length + 1}`,
        label: `Etapa ${arr.length + 1}`,
        color: '#94A3B8',
        order: arr.length,
        isWon: false,
        isLost: false,
      },
    ]);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        name,
        isDefault,
        stages: stages.map((s, i) => ({ ...s, order: i })),
      };
      if (mode === 'create') {
        await apiFetch('/pipelines', { method: 'POST', json: payload });
      } else {
        await apiFetch(`/pipelines/${pipelineId}`, { method: 'PATCH', json: payload });
      }
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-ink-100 bg-ink-50 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del tablero" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <label className="mt-6 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="rounded border-ink-300"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Usar como tablero por defecto
        </label>
      </div>

      <div>
        <div className="text-xs font-mono uppercase tracking-wider text-ink-500">Etapas</div>
        <div className="mt-2 space-y-2">
          {stages.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-ink-100 bg-white p-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  className="text-xs leading-none text-ink-500"
                  onClick={() => moveStage(i, -1)}
                  disabled={i === 0}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="text-xs leading-none text-ink-500"
                  onClick={() => moveStage(i, 1)}
                  disabled={i === stages.length - 1}
                >
                  ▼
                </button>
              </div>
              <input
                type="color"
                value={s.color}
                onChange={(e) => updateStage(i, { color: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-ink-200"
              />
              <Input
                value={s.label}
                onChange={(e) => updateStage(i, { label: e.target.value })}
                className="flex-1"
                placeholder="Nombre de la etapa"
              />
              <Input
                value={s.key}
                onChange={(e) => updateStage(i, { key: e.target.value.toUpperCase() })}
                className="w-32 font-mono text-xs"
                placeholder="KEY"
              />
              <label className="inline-flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={s.isWon}
                  onChange={(e) =>
                    updateStage(i, { isWon: e.target.checked, isLost: e.target.checked ? false : s.isLost })
                  }
                />
                Ganada
              </label>
              <label className="inline-flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={s.isLost}
                  onChange={(e) =>
                    updateStage(i, { isLost: e.target.checked, isWon: e.target.checked ? false : s.isWon })
                  }
                />
                Perdida
              </label>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline"
                onClick={() => removeStage(i)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 text-xs text-primary-700 hover:underline"
          onClick={addStage}
        >
          + Añadir etapa
        </button>
      </div>

      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}
      <div className="flex gap-2">
        <button type="button" className={buttonClass('primary', 'text-xs')} onClick={save} disabled={busy}>
          {busy ? 'Guardando…' : mode === 'create' ? 'Crear tablero' : 'Guardar cambios'}
        </button>
        <button type="button" className={buttonClass('secondary', 'text-xs')} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
