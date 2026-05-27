import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';

interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nif: string | null;
  status: string;
  createdAt: string;
}

const statusColor: Record<string, 'gray' | 'green' | 'red'> = {
  ACTIVE: 'green',
  INACTIVE: 'gray',
  ARCHIVED: 'red',
};

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

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-ink-500">{clients.length} clientes.</p>
        </div>
        <Link href="/app/clients/new" className={buttonClass('primary')}>
          + Nuevo cliente
        </Link>
      </header>

      <Card>
        <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Status</span>
            <select name="status" defaultValue={params.status ?? ''} className="mt-1 rounded border-ink-300">
              <option value="">Todos</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col">
            <span className="text-xs text-ink-500">Buscar (nombre, email, NIF)</span>
            <input type="text" name="search" defaultValue={params.search ?? ''} className="mt-1 rounded border-ink-300" />
          </label>
          <button type="submit" className={buttonClass('primary')}>Filtrar</button>
        </form>
      </Card>

      {clients.length === 0 ? (
        <Card className="text-center text-ink-500">
          Sin clientes. <Link href="/app/clients/new" className="text-primary-700 underline">Da de alta el primero</Link>.
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">NIF</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Alta</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3">
                    <Link href={`/app/clients/${c.id}`} className="font-medium text-ink-900 hover:text-primary-700">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.nif ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor[c.status] ?? 'gray'}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
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
