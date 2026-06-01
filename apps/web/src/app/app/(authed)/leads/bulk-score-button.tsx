'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

interface Agent {
  id: string;
  name: string;
  status: string;
  type?: 'CONVERSATIONAL' | 'OPPORTUNITIES' | 'UTILITY';
}

interface Props {
  agents: Agent[];
  total: number;
  filterQs: string;
}

interface BatchStatus {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'CANCELLED' | 'FAILED';
  total: number;
  completed: number;
  failed: number;
  statusUpdated: number;
  oppsCreated: number;
  etaSeconds: number | null;
  errors: { leadId: string; reason: string }[];
}

function fmtEta(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `~${sec}s`;
  const m = Math.round(sec / 60);
  return `~${m} ${m === 1 ? 'min' : 'min'}`;
}

export function BulkScoreButton({ agents, total, filterQs }: Props) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState(true);
  const [createOpps, setCreateOpps] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const stopPolling = useRef(false);

  // Scoring agents only — these are the ones that have a funnel-rule prompt.
  // Old agents (no type) default to CONVERSATIONAL in the backend so they
  // won't show up here until the tenant explicitly marks one as SCORING.
  const scoringAgents = agents.filter(
    (a) => a.status === 'PUBLISHED' && (a.type ?? 'CONVERSATIONAL') === 'OPPORTUNITIES',
  );

  // Poll while a batch is running.
  useEffect(() => {
    if (!batch || (batch.status !== 'RUNNING' && batch.status !== 'QUEUED')) return;
    stopPolling.current = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopPolling.current) return;
      try {
        const fresh = await apiFetch<BatchStatus>(`/leads/score-batch/${batch.id}`);
        setBatch(fresh);
        if (fresh.status === 'DONE') {
          toast.success(
            `Score IA terminado: ${fresh.completed} ${fresh.completed === 1 ? 'lead' : 'leads'}.`,
          );
          router.refresh();
          return;
        }
        if (fresh.status === 'CANCELLED' || fresh.status === 'FAILED') return;
      } catch {
        /* keep polling — network blips */
      }
      t = setTimeout(tick, 2000);
    };
    t = setTimeout(tick, 2000);
    return () => {
      stopPolling.current = true;
      if (t) clearTimeout(t);
    };
  }, [batch, router, toast]);

  // On open, pick up any running batch (so reload doesn't lose progress).
  async function refreshLatest() {
    try {
      const recent = await apiFetch<
        Array<{ id: string; status: string; total: number; completed: number; failed: number }>
      >('/leads/score-batch/recent');
      const running = recent.find(
        (r) => r.status === 'RUNNING' || r.status === 'QUEUED',
      );
      if (running) {
        const fresh = await apiFetch<BatchStatus>(`/leads/score-batch/${running.id}`);
        setBatch(fresh);
      }
    } catch {
      /* ignore */
    }
  }

  function openModal() {
    setOpen(true);
    setError(null);
    void refreshLatest();
  }

  async function start() {
    if (scoringAgents.length === 0) {
      setError('Necesitas un agente de tipo Scoring publicado.');
      return;
    }
    if (!agentId) {
      setError('Elige un agente de Scoring para definir las reglas del funnel.');
      return;
    }
    setError(null);
    setStarting(true);
    const filter: Record<string, string> = {};
    new URLSearchParams(filterQs).forEach((v, k) => {
      filter[k] = v;
    });
    try {
      const res = await apiFetch<{ batchId: string; total: number }>('/leads/score-batch', {
        method: 'POST',
        json: {
          filter,
          agentId: agentId || null,
          updateStatus,
          createOpportunities: createOpps,
        },
      });
      const fresh = await apiFetch<BatchStatus>(`/leads/score-batch/${res.batchId}`);
      setBatch(fresh);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error inesperado');
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!batch) return;
    const ok = await confirm({
      title: 'Cancelar score',
      description: 'Los leads ya procesados mantienen su score. Los pendientes no se ejecutan.',
      confirmLabel: 'Cancelar batch',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/leads/score-batch/${batch.id}/cancel`, { method: 'POST' });
      const fresh = await apiFetch<BatchStatus>(`/leads/score-batch/${batch.id}`);
      setBatch(fresh);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo cancelar');
    }
  }

  if (total === 0) return null;

  const running = batch && (batch.status === 'RUNNING' || batch.status === 'QUEUED');

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={buttonClass('secondary')}
        title="Calcula score IA + (opcional) cambia estado y crea oportunidades para los leads filtrados"
      >
        ✨ Score IA en masa
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Score IA en masa</h2>
                <p className="mt-1 text-sm text-ink-500">
                  La IA lee cada lead (con sus campos personalizados) y le pone un score
                  0–100. Opcionalmente actualiza estado y crea oportunidades según el
                  agente de Scoring que elijas.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="text-ink-500 hover:text-ink-900"
              >
                ✕
              </button>
            </div>

            {batch ? (
              <BatchProgressView batch={batch} onCancel={cancel} />
            ) : (
              <BatchSetupForm
                scoringAgents={scoringAgents}
                total={total}
                agentId={agentId}
                setAgentId={setAgentId}
                updateStatus={updateStatus}
                setUpdateStatus={setUpdateStatus}
                createOpps={createOpps}
                setCreateOpps={setCreateOpps}
              />
            )}

            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={buttonClass('secondary')}
              >
                {running ? 'Cerrar (sigue en background)' : 'Cerrar'}
              </button>
              {!batch && (
                <button
                  type="button"
                  onClick={start}
                  disabled={starting || scoringAgents.length === 0 || !agentId}
                  className={buttonClass('primary')}
                  title={
                    scoringAgents.length === 0
                      ? 'Crea un agente de Scoring primero'
                      : !agentId
                      ? 'Elige el agente de Scoring para empezar'
                      : ''
                  }
                >
                  {starting
                    ? 'Encolando…'
                    : `Empezar (${total} ${total === 1 ? 'lead' : 'leads'})`}
                </button>
              )}
            </div>

            {batch?.status === 'DONE' && (
              <p className="mt-3 text-center text-xs text-green-700">
                ✓ Batch completado. Cierra este modal para ver los scores en la lista.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function BatchSetupForm({
  scoringAgents,
  total,
  agentId,
  setAgentId,
  updateStatus,
  setUpdateStatus,
  createOpps,
  setCreateOpps,
}: {
  scoringAgents: Agent[];
  total: number;
  agentId: string;
  setAgentId: (v: string) => void;
  updateStatus: boolean;
  setUpdateStatus: (v: boolean) => void;
  createOpps: boolean;
  setCreateOpps: (v: boolean) => void;
}) {
  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-ink-100/50 p-3 text-sm">
        <div>
          <dt className="text-xs text-ink-500">Leads filtrados</dt>
          <dd className="font-mono">{total}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Procesamiento</dt>
          <dd className="font-mono">Asíncrono · 4 paralelos</dd>
        </div>
      </dl>

      {scoringAgents.length === 0 ? (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          No tienes agentes de tipo <strong>Scoring</strong> publicados. Crea uno con
          las reglas del funnel (qué es un cliente, qué es perdido, etc).{' '}
          <Link href="/app/agents/new" className="text-primary-700 hover:underline">
            + Crear agente de scoring
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-ink-700">
              Agente de Scoring · define las reglas del funnel <span className="text-red-600">*</span>
            </span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— Elige un agente —</option>
              {scoringAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink-500">
              Solo se listan agentes con <strong>tipo Scoring + estado Publicado</strong>. Si no
              ves el que quieres, asegúrate de tenerlo publicado en{' '}
              <a href="/app/agents" className="text-primary-700 hover:underline">
                Agentes
              </a>
              .
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={updateStatus}
              onChange={(e) => setUpdateStatus(e.target.checked)}
              className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              <strong>Actualizar estado</strong> (Lead / Cliente / Perdido) según la decisión del
              agente.
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={createOpps}
              onChange={(e) => setCreateOpps(e.target.checked)}
              className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              <strong>Crear oportunidad</strong> cuando el agente identifique interés claro.
            </span>
          </label>
        </div>
      )}
    </>
  );
}

function BatchProgressView({
  batch,
  onCancel,
}: {
  batch: BatchStatus;
  onCancel: () => void;
}) {
  const done = batch.completed + batch.failed;
  const pct = Math.round((done / batch.total) * 100);
  return (
    <div className="mt-4 space-y-3">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">
            {batch.status === 'QUEUED' && 'En cola…'}
            {batch.status === 'RUNNING' && `Procesando ${done} / ${batch.total}`}
            {batch.status === 'DONE' && `✓ Completado ${batch.total}`}
            {batch.status === 'CANCELLED' && 'Cancelado'}
            {batch.status === 'FAILED' && 'Error'}
          </span>
          <span className="font-mono text-xs text-ink-500">
            {batch.status === 'RUNNING' && batch.etaSeconds != null
              ? `${fmtEta(batch.etaSeconds)} restantes · ${pct}%`
              : `${pct}%`}
          </span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full transition-all ${
              batch.status === 'DONE'
                ? 'bg-green-500'
                : batch.status === 'CANCELLED' || batch.status === 'FAILED'
                ? 'bg-amber-500'
                : 'bg-primary-600'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 rounded-md bg-ink-100/50 p-3 text-xs">
        <div>
          <dt className="text-ink-500">Puntuados</dt>
          <dd className="text-base font-semibold">{batch.completed}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Estados actualizados</dt>
          <dd className="text-base font-semibold">{batch.statusUpdated}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Oportunidades</dt>
          <dd className="text-base font-semibold">{batch.oppsCreated}</dd>
        </div>
      </dl>

      {batch.failed > 0 && (
        <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
          <summary className="cursor-pointer font-medium text-amber-900">
            {batch.failed} {batch.failed === 1 ? 'lead con error' : 'leads con errores'}
          </summary>
          <ul className="mt-2 space-y-1 text-amber-900">
            {batch.errors.slice(0, 30).map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.leadId.slice(0, 6)}…</span>: {e.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(batch.status === 'RUNNING' || batch.status === 'QUEUED') && (
        <div className="flex justify-between gap-2 text-xs">
          <p className="text-ink-500">
            Puedes cerrar este modal y volver — el batch sigue en background.
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="text-red-600 hover:underline"
          >
            Cancelar batch
          </button>
        </div>
      )}
    </div>
  );
}
