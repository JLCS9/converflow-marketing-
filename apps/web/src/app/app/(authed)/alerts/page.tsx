import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { AlertItem, MarkAllReadButton, type Alert } from './alert-item';

export const metadata = { title: 'Alertas' };

export default async function AlertsPage() {
  const alerts = await serverApiFetch<Alert[]>('/alerts');
  const unread = alerts.filter((a) => !a.readAt).length;
  const critical = alerts.filter((a) => a.severity === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas"
        description="Avisos automáticos cuando un lead lleva días sin contactar, una oportunidad se acerca a su fecha de cierre o una tarea se pasa. Se recalculan en cada carga."
        action={unread > 0 ? <MarkAllReadButton /> : undefined}
      />

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
        <EmptyState
          tone="positive"
          icon={<span className="text-base">✓</span>}
          title="Todo al día"
          description="No tienes alertas activas. Te avisaremos aquí cuando algo necesite tu atención."
        />
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
