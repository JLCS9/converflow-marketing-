import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, StatCard } from '@/components/ui/primitives';

interface Overview {
  leads: {
    total: number;
    byStatus: { status: string; count: number }[];
    bySource: { source: string; count: number }[];
    conversionRate: number;
  };
  opportunities: {
    byStage: { status: string; count: number; value: number }[];
    openValue: number;
    wonValue: number;
    pipelineByMonth: { month: string; value: number; count: number }[];
  };
  tasks: { pending: number; overdue: number; done: number };
  clients: { total: number; active: number };
}

export const metadata = { title: 'Panel' };

const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const leadStatusLabel: Record<string, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  QUALIFIED: 'Cualificado',
  CONVERTED: 'Convertido',
  LOST: 'Perdido',
};
const leadStatusColor: Record<string, string> = {
  NEW: 'bg-ink-300',
  CONTACTED: 'bg-blue-400',
  QUALIFIED: 'bg-amber-400',
  CONVERTED: 'bg-green-500',
  LOST: 'bg-red-400',
};

const oppStageLabel: Record<string, string> = {
  OPEN: 'Abierta',
  QUOTED: 'Presupuestada',
  NEGOTIATING: 'Negociación',
  WON: 'Ganada',
  LOST: 'Perdida',
};
const oppStageColor: Record<string, string> = {
  OPEN: 'bg-ink-300',
  QUOTED: 'bg-blue-400',
  NEGOTIATING: 'bg-amber-400',
  WON: 'bg-green-500',
  LOST: 'bg-red-400',
};

function Bar({
  label,
  value,
  max,
  color,
  display,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  display?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-700">{label}</span>
        <span className="font-mono text-xs text-ink-500">{display ?? value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function TenantDashboard() {
  const data = await serverApiFetch<Overview>('/reports/overview');

  const funnelMax = Math.max(1, ...data.leads.byStatus.map((s) => s.count));
  const stageMax = Math.max(1, ...data.opportunities.byStage.map((s) => s.count));
  const sourceMax = Math.max(1, ...data.leads.bySource.map((s) => s.count));
  const monthMax = Math.max(1, ...data.opportunities.pipelineByMonth.map((m) => m.value));

  const isEmpty = data.leads.total === 0 && data.opportunities.byStage.every((s) => s.count === 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="mt-1 text-sm text-ink-500">
          Reporting agregado de tu actividad comercial. Refrescado en cada carga.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads" value={data.leads.total} hint={`${data.clients.total} clientes`} />
        <StatCard
          label="Tasa de conversión"
          value={`${Math.round(data.leads.conversionRate * 100)}%`}
          hint="Leads convertidos / total"
        />
        <StatCard
          label="Pipeline abierto"
          value={eur.format(data.opportunities.openValue)}
          hint={`${eur.format(data.opportunities.wonValue)} ganado`}
        />
        <StatCard
          label="Tareas vencidas"
          value={data.tasks.overdue}
          hint={`${data.tasks.pending} pendientes en total`}
        />
      </section>

      {isEmpty ? (
        <Card>
          <h2 className="text-base font-semibold">Aún no hay datos que mostrar</h2>
          <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-ink-700">
            <li>
              <Link href="/app/leads/new" className="text-primary-700 hover:underline">
                Crea tu primer lead
              </Link>{' '}
              o{' '}
              <Link href="/app/leads/import" className="text-primary-700 hover:underline">
                importa una lista
              </Link>{' '}
              para empezar a ver tu embudo.
            </li>
            <li>
              <Link href="/app/opportunities/new" className="text-primary-700 hover:underline">
                Registra una oportunidad
              </Link>{' '}
              con importe y fecha de cierre para ver el pipeline.
            </li>
          </ol>
        </Card>
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="text-base font-semibold">Embudo de leads</h2>
              <p className="mt-1 text-xs text-ink-500">Distribución por estado.</p>
              <div className="mt-4 space-y-3">
                {data.leads.byStatus.map((s) => (
                  <Bar
                    key={s.status}
                    label={leadStatusLabel[s.status] ?? s.status}
                    value={s.count}
                    max={funnelMax}
                    color={leadStatusColor[s.status] ?? 'bg-ink-300'}
                  />
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="text-base font-semibold">Oportunidades por etapa</h2>
              <p className="mt-1 text-xs text-ink-500">Nº de oportunidades e importe.</p>
              <div className="mt-4 space-y-3">
                {data.opportunities.byStage.map((s) => (
                  <Bar
                    key={s.status}
                    label={oppStageLabel[s.status] ?? s.status}
                    value={s.count}
                    max={stageMax}
                    color={oppStageColor[s.status] ?? 'bg-ink-300'}
                    display={`${s.count} · ${eur.format(s.value)}`}
                  />
                ))}
              </div>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="text-base font-semibold">Leads por fuente</h2>
              <div className="mt-4 space-y-3">
                {data.leads.bySource.length === 0 ? (
                  <p className="text-sm text-ink-500">Sin datos de fuente.</p>
                ) : (
                  data.leads.bySource.map((s) => (
                    <Bar
                      key={s.source}
                      label={s.source}
                      value={s.count}
                      max={sourceMax}
                      color="bg-primary-500"
                    />
                  ))
                )}
              </div>
            </Card>

            <Card>
              <h2 className="text-base font-semibold">Pipeline abierto por mes de cierre</h2>
              <p className="mt-1 text-xs text-ink-500">
                Importe esperado de oportunidades abiertas.
              </p>
              <div className="mt-4 space-y-3">
                {data.opportunities.pipelineByMonth.length === 0 ? (
                  <p className="text-sm text-ink-500">
                    No hay oportunidades abiertas con fecha de cierre e importe.
                  </p>
                ) : (
                  data.opportunities.pipelineByMonth.map((m) => (
                    <Bar
                      key={m.month}
                      label={new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('es-ES', {
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })}
                      value={m.value}
                      max={monthMax}
                      color="bg-green-500"
                      display={`${m.count} · ${eur.format(m.value)}`}
                    />
                  ))
                )}
              </div>
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <StatCard label="Tareas pendientes" value={data.tasks.pending} />
            <StatCard label="Tareas vencidas" value={data.tasks.overdue} />
            <StatCard label="Tareas completadas" value={data.tasks.done} />
          </section>
        </>
      )}
    </div>
  );
}
