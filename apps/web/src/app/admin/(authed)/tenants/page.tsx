import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, buttonClass, tenantStatusBadge } from '@/components/ui/primitives';

interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  maxUsers: number;
  maxBots: number;
  kitDigitalSegment: string | null;
  createdAt: string;
  _count: { users: number; bots: number };
}

export const metadata = { title: 'Admin · Tenants' };

export default async function TenantsListPage() {
  const tenants = await serverApiFetch<TenantListItem[]>('/admin/tenants');

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="mt-1 text-sm text-ink-500">
            {tenants.length} {tenants.length === 1 ? 'cliente' : 'clientes'} en la plataforma.
          </p>
        </div>
        <Link href="/admin/tenants/new" className={buttonClass('primary')}>
          + Nuevo tenant
        </Link>
      </header>

      {tenants.length === 0 ? (
        <Card className="text-center">
          <p className="text-ink-500">
            Aún no hay tenants. Crea el primero para empezar.
          </p>
          <div className="mt-4">
            <Link href="/admin/tenants/new" className={buttonClass('primary')}>
              + Crear primer tenant
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Segmento KD</th>
                <th className="px-4 py-3 text-right">Users</th>
                <th className="px-4 py-3 text-right">Bots</th>
                <th className="px-4 py-3">Creado</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="font-medium text-ink-900 hover:text-primary-700"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">{t.slug}</td>
                  <td className="px-4 py-3">{tenantStatusBadge(t.status)}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {t.kitDigitalSegment ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono">
                      {t._count.users}/{t.maxUsers}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono">
                      {t._count.bots}/{t.maxBots}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {new Date(t.createdAt).toLocaleDateString('es-ES')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
