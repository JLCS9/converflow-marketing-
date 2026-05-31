import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TabBar, CRM_TABS } from '@/components/ui/tab-bar';
import { CLIENT_STATUS, CLIENT_STATUS_COLOR, statusColor, statusLabel } from '@/lib/labels';

interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nif: string | null;
  status: string;
  createdAt: string;
}

export const metadata = { title: 'Clientes' };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);

  const clients = await serverApiFetch<ClientRow[]>(`/clients?${qs.toString()}`);
  const hasFilters = Boolean(params.status || params.search);

  return (
    <div className="space-y-6">
      <TabBar items={CRM_TABS} />
      <PageHeader
        title="Clientes"
        description={`${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}.`}
        action={
          <Link href="/app/clients/new" className={buttonClass('primary')}>
            + Nuevo cliente
          </Link>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Estado</span>
            <select
              name="status"
              defaultValue={params.status ?? ''}
              className="mt-1 rounded-md border border-ink-300 px-2 py-1.5"
            >
              <option value="">Todos</option>
              {Object.entries(CLIENT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col">
            <span className="text-xs text-ink-500">Buscar (nombre, email, NIF)</span>
            <input
              type="text"
              name="search"
              defaultValue={params.search ?? ''}
              className="mt-1 rounded-md border border-ink-300 px-2 py-1.5"
            />
          </label>
          <button type="submit" className={buttonClass('primary')}>
            Filtrar
          </button>
        </form>
      </Card>

      {clients.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="Sin resultados"
            description="Ningún cliente coincide con los filtros."
            cta={
              <Link href="/app/clients" className={buttonClass('secondary', 'text-xs')}>
                Quitar filtros
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Aún no tienes clientes"
            description="Los leads que pasen a ganado se convierten automáticamente en clientes. También puedes darlos de alta a mano."
            cta={
              <Link href="/app/clients/new" className={buttonClass('primary', 'text-xs')}>
                + Nuevo cliente
              </Link>
            }
          />
        )
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="hidden px-4 py-3 md:table-cell">NIF</th>
                <th className="hidden px-4 py-3 md:table-cell">Email</th>
                <th className="hidden px-4 py-3 lg:table-cell">Teléfono</th>
                <th className="px-4 py-3">Estado</th>
                <th className="hidden px-4 py-3 md:table-cell">Alta</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/clients/${c.id}`}
                      className="font-medium text-ink-900 hover:text-primary-700"
                    >
                      {c.name}
                    </Link>
                    <div className="mt-0.5 text-xs text-ink-500 md:hidden">
                      {c.nif ?? c.email ?? c.phone ?? '—'}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs md:table-cell">{c.nif ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-xs md:table-cell">{c.email ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-xs lg:table-cell">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor(CLIENT_STATUS_COLOR, c.status)}>
                      {statusLabel(CLIENT_STATUS, c.status)}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-ink-500 md:table-cell">
                    {new Date(c.createdAt).toLocaleDateString('es-ES')}
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
