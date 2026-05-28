import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { AlertItem, MarkAllReadButton, type Alert } from './alert-item';

export const metadata = { title: 'Alertas' };

export default async function AlertsPage() {
  const alerts = await serverApiFetch<Alert[]>('/alerts');
  const unread = alerts.filter((a) => !a.readAt).length;
  const critical = alerts.filter((a) => a.severity === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
          <p className="mt-1 text-sm text-ink-500">
            Avisos automáticos sobre leads sin contactar, oportunidades vencidas, tareas
            atrasadas y leads de alta prioridad. Se recalculan en cada carga.
          </p>
        </div>
        {unread > 0 && <MarkAllReadButton />}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">Activas</div>
          <div className="mt-1 text-2xl font-semibold">{alerts.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">Sin leer</div>
          <div className="mt-1 text-2xl font-semibold">{unread}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">Críticas</div>
          <div className={`mt-1 text-2xl font-semibold ${critical > 0 ? 'text-red-600' : ''}`}>
            {critical}
          </div>
        </Card>
      </section>

      {alerts.length === 0 ? (
        <Card className="text-center text-ink-500">
          🎉 No tienes alertas activas. Todo al día.
        </Card>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <AlertItem key={a.id} alert={a} />
          ))}
        </ul>
      )}
    </div>
  );
}
