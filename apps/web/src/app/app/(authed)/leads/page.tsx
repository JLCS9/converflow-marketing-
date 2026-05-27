import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';

interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: string;
  score: number | null;
  ownerId: string | null;
  createdAt: string;
}

const statusColor: Record<string, 'gray' | 'green' | 'yellow' | 'red' | 'blue'> = {
  NEW: 'gray',
  CONTACTED: 'blue',
  QUALIFIED: 'yellow',
  CONVERTED: 'green',
  LOST: 'red',
};

export const metadata = { title: 'Leads' };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);

  const leads = await serverApiFetch<LeadRow[]>(`/leads?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-ink-500">
            {leads.length} leads. Da de alta manualmente o importa por CSV.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/leads/import" className={buttonClass('secondary')}>
            ⤒ Importar CSV
          </Link>
          <Link href="/app/leads/new" className={buttonClass('primary')}>
            + Nuevo lead
          </Link>
        </div>
      </header>

      <Card>
        <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Status</span>
            <select name="status" defaultValue={params.status ?? ''} className="mt-1 rounded border-ink-300">
              <option value="">Todos</option>
              <option value="NEW">NEW</option>
              <option value="CONTACTED">CONTACTED</option>
              <option value="QUALIFIED">QUALIFIED</option>
              <option value="CONVERTED">CONVERTED</option>
              <option value="LOST">LOST</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col">
            <span className="text-xs text-ink-500">Buscar (nombre, email, empresa)</span>
            <input
              type="text"
              name="search"
              defaultValue={params.search ?? ''}
              className="mt-1 rounded border-ink-300"
            />
          </label>
          <button type="submit" className={buttonClass('primary')}>
            Filtrar
          </button>
        </form>
      </Card>

      {leads.length === 0 ? (
        <Card className="text-center text-ink-500">
          Sin leads. <Link href="/app/leads/new" className="text-primary-700 underline">Crea el primero</Link>.
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3">Creado</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/leads/${l.id}`}
                      className="font-medium text-ink-900 hover:text-primary-700"
                    >
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs">{l.company ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{l.email ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{l.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor[l.status] ?? 'gray'}>{l.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {l.score != null ? l.score : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">{l.source ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {new Date(l.createdAt).toLocaleDateString('es-ES')}
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
