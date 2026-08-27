'use client';

/**
 * Automation controls: what the AI does on its own, how much it may spend, and
 * which alert rules run.
 *
 * This screen exists because a customer found tasks and alerts appearing in
 * their account with no way to stop them, and because AI spend had no ceiling.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/primitives';

interface AlertRules {
  staleLead: { enabled: boolean; days: number };
  oppOverdue: { enabled: boolean };
  taskOverdue: { enabled: boolean };
  hotLead: { enabled: boolean; minScore: number };
}

interface Automation {
  aiInboundAnalysis: boolean;
  aiMonthlyTokenCap: number | null;
  alertRules: AlertRules;
  tokensThisMonth: number;
}

const fmt = (n: number) => n.toLocaleString('es-ES');

function Row({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-800">{title}</p>
        <p className="mt-0.5 text-xs text-ink-500">{help}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-primary-600' : 'bg-ink-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function AutomationCard() {
  const [data, setData] = useState<Automation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<Automation>('/me/automation')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar'));
  }, []);

  const save = useCallback(async (patch: Partial<Automation>) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await apiFetch<Automation>('/me/automation', { method: 'PATCH', json: patch });
      setData(next);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, []);

  if (!data) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-ink-500">
          {error ? (
            <>
              <AlertTriangle size={14} className="text-red-600" /> {error}
            </>
          ) : (
            <>
              <Loader2 size={14} className="animate-spin" /> Cargando…
            </>
          )}
        </div>
      </Card>
    );
  }

  const rules = data.alertRules;
  const setRules = (patch: Partial<AlertRules>) =>
    void save({ alertRules: { ...rules, ...patch } as AlertRules });

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink-900">IA y automatización</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Decides tú qué hace la IA por su cuenta y cuánto puede gastar. Nada de esto afecta a
            las funciones que pides a mano (resumir, traducir, redactar).
          </p>
        </div>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Inteligencia artificial
          </h3>
          <Row
            title="Analizar automáticamente los mensajes que llegan"
            help="Clasifica cada mensaje entrante y prepara una sugerencia de respuesta. Es lo que más consume: se ejecuta en cada mensaje. Apagarlo no afecta a los agentes que ya tengas en modo Auto."
          >
            <Toggle
              on={data.aiInboundAnalysis}
              disabled={saving}
              onChange={(v) => void save({ aiInboundAnalysis: v })}
            />
          </Row>
          <Row
            title="Límite mensual de uso de IA"
            help={`Consumo de este mes: ${fmt(data.tokensThisMonth)} unidades. Al alcanzar el límite, la IA se detiene en lugar de seguir gastando. Vacío = sin límite.`}
          >
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step={100000}
                defaultValue={data.aiMonthlyTokenCap ?? ''}
                placeholder="sin límite"
                disabled={saving}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const next = raw === '' ? null : Number(raw);
                  if (next !== data.aiMonthlyTokenCap) void save({ aiMonthlyTokenCap: next });
                }}
                className="w-32 rounded border border-ink-200 px-2 py-1 text-right text-xs focus:border-ink-700 focus:outline-none"
              />
            </div>
          </Row>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Alertas automáticas
          </h3>
          <Row
            title="Lead sin contactar"
            help="Avisa cuando un lead lleva demasiados días sin primer contacto."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                defaultValue={rules.staleLead.days}
                disabled={saving || !rules.staleLead.enabled}
                onBlur={(e) => {
                  const days = Number(e.target.value);
                  if (days && days !== rules.staleLead.days) {
                    setRules({ staleLead: { ...rules.staleLead, days } });
                  }
                }}
                className="w-16 rounded border border-ink-200 px-1.5 py-1 text-right text-xs disabled:opacity-50"
              />
              <span className="text-xs text-ink-400">días</span>
              <Toggle
                on={rules.staleLead.enabled}
                disabled={saving}
                onChange={(v) => setRules({ staleLead: { ...rules.staleLead, enabled: v } })}
              />
            </div>
          </Row>
          <Row title="Oportunidad con cierre vencido" help="Avisa cuando pasa la fecha prevista de cierre.">
            <Toggle
              on={rules.oppOverdue.enabled}
              disabled={saving}
              onChange={(v) => setRules({ oppOverdue: { enabled: v } })}
            />
          </Row>
          <Row title="Tarea vencida" help="Avisa cuando una tarea pasa su fecha de vencimiento.">
            <Toggle
              on={rules.taskOverdue.enabled}
              disabled={saving}
              onChange={(v) => setRules({ taskOverdue: { enabled: v } })}
            />
          </Row>
          <Row
            title="Lead de alta prioridad"
            help="Avisa cuando un lead supera la puntuación indicada y sigue sin convertir."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                defaultValue={rules.hotLead.minScore}
                disabled={saving || !rules.hotLead.enabled}
                onBlur={(e) => {
                  const minScore = Number(e.target.value);
                  if (minScore && minScore !== rules.hotLead.minScore) {
                    setRules({ hotLead: { ...rules.hotLead, minScore } });
                  }
                }}
                className="w-16 rounded border border-ink-200 px-1.5 py-1 text-right text-xs disabled:opacity-50"
              />
              <Toggle
                on={rules.hotLead.enabled}
                disabled={saving}
                onChange={(v) => setRules({ hotLead: { ...rules.hotLead, enabled: v } })}
              />
            </div>
          </Row>
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
            Las alertas gráficas son uno de los requisitos de Kit Digital. Si desactivas todas,
            tu instalación deja de cumplir ese punto.
          </p>
        </section>

        <div className="flex items-center gap-2 text-xs">
          {saving && (
            <span className="inline-flex items-center gap-1 text-ink-500">
              <Loader2 size={12} className="animate-spin" /> Guardando…
            </span>
          )}
          {saved && !saving && <span className="text-green-700">Guardado</span>}
          {error && (
            <span className="inline-flex items-center gap-1 text-red-700">
              <AlertTriangle size={12} /> {error}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
