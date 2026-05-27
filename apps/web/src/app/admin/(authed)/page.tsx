import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, StatCard, buttonClass } from '@/components/ui/primitives';

interface Stats {
  tenants: { total: number; active: number; trial: number; suspended: number };
  users: number;
  bots: number;
  accessLogsLast24h: number;
}

export const metadata = { title: 'Admin · Dashboard' };

export default async function AdminHome() {
  const stats = await serverApiFetch<Stats>('/admin/stats');

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">
            Estado global de la plataforma. Actualizado en cada carga.
          </p>
        </div>
        <Link href="/admin/tenants/new" className={buttonClass('primary')}>
          + Nuevo tenant
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tenants"
          value={stats.tenants.total}
          hint={`${stats.tenants.active} activos · ${stats.tenants.trial} trial · ${stats.tenants.suspended} suspended`}
        />
        <StatCard label="Usuarios" value={stats.users} hint="Total en la plataforma" />
        <StatCard label="Bots" value={stats.bots} hint="Conectados o en preparación" />
        <StatCard
          label="Accesos (24h)"
          value={stats.accessLogsLast24h}
          hint="Logs de Kit Digital recientes"
        />
      </section>

      <Card>
        <h2 className="text-base font-semibold">Próximas funcionalidades</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-ink-500">
          <li>
            <Link href="/admin/tenants" className="text-primary-700 hover:underline">
              Gestionar tenants
            </Link>{' '}
            — listo: crear, editar límites, ver detalle.
          </li>
          <li>Bots globales (próxima iteración): vista cross-tenant con estado y reinicio remoto.</li>
          <li>Usuarios globales: búsqueda por email, impersonación con auditoría.</li>
          <li>Audit log: vista paginada de acciones admin con filtros.</li>
        </ul>
      </Card>
    </div>
  );
}
