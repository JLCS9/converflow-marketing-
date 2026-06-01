'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

interface Agent {
  id: string;
  name: string;
  status: string;
}

interface Props {
  agents: Agent[];
  total: number;
  filterQs: string;
}

interface BatchResult {
  scored: number;
  statusUpdated: number;
  opportunitiesCreated: number;
  errors: { leadId: string; reason: string }[];
}

const MAX_BATCH = 200;

export function BulkScoreButton({ agents, total, filterQs }: Props) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState(true);
  const [createOpps, setCreateOpps] = useState(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligible = Math.min(total, MAX_BATCH);
  const publishedAgents = agents.filter((a) => a.status === 'PUBLISHED');

  if (total === 0) return null;

  function run() {
    setError(null);
    setResult(null);
    const filter: Record<string, string> = {};
    new URLSearchParams(filterQs).forEach((v, k) => {
      filter[k] = v;
    });
    startTransition(async () => {
      try {
        const res = await apiFetch<BatchResult>('/leads/score-batch', {
          method: 'POST',
          json: {
            filter,
            agentId: agentId || null,
            updateStatus,
            createOpportunities: createOpps,
          },
        });
        setResult(res);
        toast.success(
          `Score IA terminado: ${res.scored} ${res.scored === 1 ? 'lead' : 'leads'}.`,
        );
        router.refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Error desconocido');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
                <h2 className="text-lg font-semibold tracking-tight">
                  Score IA en masa
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  La IA leerá cada lead (con sus campos personalizados) y le pondrá un
                  score de 0–100. Opcionalmente actualiza el estado y crea oportunidades
                  según un agente que tú elijas como guía del funnel.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-ink-500 hover:text-ink-900"
              >
                ✕
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-ink-100/50 p-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Leads filtrados</dt>
                <dd className="font-mono">{total}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Se procesarán</dt>
                <dd className="font-mono">
                  {eligible}{total > MAX_BATCH ? ` (max por tirada: ${MAX_BATCH})` : ''}
                </dd>
              </div>
            </dl>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-ink-700">
                  Agente que define las reglas del funnel (opcional)
                </span>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  disabled={pending}
                  className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">— Sin agente: usa criterios estándar B2B España —</option>
                  {publishedAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-ink-500">
                  El prompt del agente se inyecta como "Reglas del funnel" — perfecto para
                  describir cómo categorizar tu negocio (p.ej. "reserva hecha = cliente,
                  no = perdida, vacío = potencial").
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.checked)}
                  disabled={pending}
                  className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
                />
                <span>
                  <strong>Actualizar estado</strong> según la decisión del agente
                  <br />
                  <span className="text-xs text-ink-500">
                    Cada lead puede pasar a Lead, Cliente o Perdido si el agente lo indica.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createOpps}
                  onChange={(e) => setCreateOpps(e.target.checked)}
                  disabled={pending}
                  className="mt-0.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
                />
                <span>
                  <strong>Crear oportunidad</strong> cuando el agente identifique interés
                  claro
                  <br />
                  <span className="text-xs text-ink-500">
                    Las oportunidades aterrizan en el tablero por defecto, en la primera
                    etapa, vinculadas al lead. La probabilidad inicial es el score.
                  </span>
                </span>
              </label>
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {result && (
              <div className="mt-4 space-y-1 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <div>
                  <strong>✓ {result.scored}</strong>{' '}
                  {result.scored === 1 ? 'lead puntuado' : 'leads puntuados'}
                </div>
                <div>
                  <strong>{result.statusUpdated}</strong> con estado actualizado ·{' '}
                  <strong>{result.opportunitiesCreated}</strong> oportunidades creadas
                </div>
                {result.errors.length > 0 && (
                  <div className="text-amber-800">
                    {result.errors.length} con error (revisa logs si persiste).
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className={buttonClass('secondary')}
              >
                {result ? 'Cerrar' : 'Cancelar'}
              </button>
              {!result && (
                <button
                  type="button"
                  onClick={run}
                  disabled={pending}
                  className={buttonClass('primary')}
                >
                  {pending
                    ? 'Procesando…'
                    : `Empezar (${eligible} ${eligible === 1 ? 'lead' : 'leads'})`}
                </button>
              )}
            </div>

            {pending && (
              <p className="mt-3 text-center text-xs text-ink-500">
                Cada lead tarda ~3-5s. Para {eligible} leads cuenta unos{' '}
                {Math.ceil((eligible * 4) / 4 / 60)} {Math.ceil((eligible * 4) / 4 / 60) === 1 ? 'minuto' : 'minutos'}.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
