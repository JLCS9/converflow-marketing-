import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TabBar, CRM_TABS } from '@/components/ui/tab-bar';
import { LEAD_STATUS, LEAD_STATUS_COLOR, statusColor, statusLabel } from '@/lib/labels';

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
  const hasFilters = Boolean(params.status || params.search);

  return (
    <div className="space-y-6">
      <TabBar items={CRM_TABS} />
      <PageHeader
        title="Leads"
        description={`${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}. Da de alta manualmente o importa por CSV.`}
        action={
          <div className="flex gap-2">
            <Link href="/app/leads/import" className={buttonClass('secondary')}>
              ⤒ Importar CSV
            </Link>
            <Link href="/app/leads/new" className={buttonClass('primary')}>
              + Nuevo lead
            </Link>
          </div>
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
              {Object.entries(LEAD_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col">
            <span className="text-xs text-ink-500">Buscar (nombre, email, empresa)</span>
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

      {leads.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="Sin resultados"
            description="Ningún lead coincide con los filtros. Prueba a quitarlos o cambia los criterios."
            cta={
              <Link href="/app/leads" className={buttonClass('secondary', 'text-xs')}>
                Quitar filtros
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Aún no tienes leads"
            description="Crea tu primer lead manualmente o importa una lista en CSV."
            cta={
              <Link href="/app/leads/new" className={buttonClass('primary', 'text-xs')}>
                + Nuevo lead
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
                <th className="hidden px-4 py-3 md:table-cell">Email</th>
                <th className="hidden px-4 py-3 lg:table-cell">Teléfono</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Score</th>
                <th className="hidden px-4 py-3 lg:table-cell">Fuente</th>
                <th className="hidden px-4 py-3 md:table-cell">Creado</th>
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
                    <div className="mt-0.5 text-xs text-ink-500 md:hidden">
                      {l.email ?? l.phone ?? '—'}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-xs md:table-cell">{l.email ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-xs lg:table-cell">{l.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor(LEAD_STATUS_COLOR, l.status)}>
                      {statusLabel(LEAD_STATUS, l.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {l.score != null ? l.score : '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-xs lg:table-cell">{l.source ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-xs text-ink-500 md:table-cell">
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
