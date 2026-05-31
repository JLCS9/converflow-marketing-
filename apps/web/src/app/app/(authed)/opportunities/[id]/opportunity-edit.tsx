'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

interface PipelineStage {
  id: string;
  key: string;
  label: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}

interface Opp {
  id: string;
  name: string;
  amount: string | null;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  proposalUrl: string | null;
  stageId: string | null;
  pipelineId: string | null;
}

export function OpportunityEdit({
  opp,
  pipeline,
}: {
  opp: Opp;
  pipeline: Pipeline | null;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: opp.name,
    amount: opp.amount ?? '',
    currency: opp.currency,
    probability: opp.probability,
    expectedCloseDate: opp.expectedCloseDate?.slice(0, 10) ?? '',
    proposalUrl: opp.proposalUrl ?? '',
    stageId: opp.stageId ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/opportunities/${opp.id}`, {
        method: 'PATCH',
        json: {
          name: form.name,
          amount: form.amount === '' ? undefined : Number(form.amount),
          currency: form.currency,
          probability: Number(form.probability),
          expectedCloseDate: form.expectedCloseDate || undefined,
          proposalUrl: form.proposalUrl || undefined,
          stageId: form.stageId || undefined,
        },
      });
      toast.success('Cambios guardados');
      setEditing(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo guardar';
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function moveToStage(stageId: string) {
    if (stageId === opp.stageId) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/opportunities/${opp.id}`, {
        method: 'PATCH',
        json: { stageId },
      });
      toast.success('Etapa actualizada');
      router.refresh();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo mover';
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const stages = pipeline?.stages ? [...pipeline.stages].sort((a, b) => a.order - b.order) : [];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Detalles</h2>
        {editing ? (
          <button type="button" className="text-xs text-ink-500" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            className="text-xs text-primary-700 hover:underline"
            onClick={() => setEditing(true)}
          >
            Editar
          </button>
        )}
      </div>

      {stages.length > 0 && !editing && (
        <div className="mt-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">Mover a etapa</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stages.map((s) => {
              const isCurrent = s.id === opp.stageId;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy || isCurrent}
                  onClick={() => void moveToStage(s.id)}
                  className={`rounded px-2 py-1 text-xs font-medium text-white transition-opacity ${
                    isCurrent ? 'cursor-default opacity-100' : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: s.color }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {editing ? (
          <>
            <Field label="Nombre" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Importe">
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </Field>
              <Field label="Moneda">
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  maxLength={3}
                />
              </Field>
              <Field label="Probabilidad (%)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.probability}
                  onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })}
                />
              </Field>
              <Field label="Cierre esperado">
                <Input
                  type="date"
                  value={form.expectedCloseDate}
                  onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Etapa">
              <Select
                value={form.stageId}
                onChange={(e) => setForm({ ...form, stageId: e.target.value })}
              >
                <option value="">— sin etapa —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="URL de propuesta">
              <Input
                value={form.proposalUrl}
                onChange={(e) => setForm({ ...form, proposalUrl: e.target.value })}
                placeholder="https://…"
              />
            </Field>
            {err && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
            )}
            <button
              type="button"
              className={buttonClass('primary', 'text-xs')}
              onClick={save}
              disabled={busy}
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        ) : (
          <dl className="space-y-2 text-sm">
            <Row
              label="Importe"
              value={
                opp.amount ? `${Number(opp.amount).toLocaleString('es-ES')} ${opp.currency}` : '—'
              }
            />
            <Row label="Probabilidad" value={`${opp.probability}%`} />
            <Row
              label="Cierre esperado"
              value={
                opp.expectedCloseDate
                  ? new Date(opp.expectedCloseDate).toLocaleDateString('es-ES')
                  : '—'
              }
            />
            <Row
              label="Propuesta"
              value={opp.proposalUrl ? <a className="text-primary-700 hover:underline" href={opp.proposalUrl} target="_blank" rel="noreferrer">Ver</a> : '—'}
            />
            {err && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
            )}
          </dl>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
