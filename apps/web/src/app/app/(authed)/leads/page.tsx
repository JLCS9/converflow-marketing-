import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TabBar, CRM_TABS } from '@/components/ui/tab-bar';
import { LEAD_STATUS, LEAD_STATUS_COLOR, LEAD_STATUS_OPTIONS, statusColor, statusLabel } from '@/lib/labels';
import { LeadsPagination } from './pagination';
import { LeadsTopActions } from './leads-top-actions';

interface LeadRow {
  id: string;
  name: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: string;
  score: number | null;
  ownerId: string | null;
  createdAt: string;
}

interface AgentLite {
  id: string;
  name: string;
  status: string;
}

const PAGE_SIZES = [25, 50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZES)[number];
const DEFAULT_PAGE_SIZE: PageSize = 50;

function clampPageSize(raw: string | undefined): PageSize {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSize) : DEFAULT_PAGE_SIZE;
}

export const metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  const params = await searchParams;
  const perPage = clampPageSize(params.perPage);
  const page = Math.max(1, Number(params.page) || 1);

  const filterQs = new URLSearchParams();
  if (params.status) filterQs.set('status', params.status);
  if (params.search) filterQs.set('search', params.search);

  const listQs = new URLSearchParams(filterQs);
  listQs.set('limit', String(perPage));
  listQs.set('offset', String((page - 1) * perPage));

  const [leads, countRes, agents] = await Promise.all([
    serverApiFetch<LeadRow[]>(`/leads?${listQs.toString()}`),
    serverApiFetch<{ total: number }>(`/leads/count?${filterQs.toString()}`).catch(() => ({
      total: 0,
    })),
    serverApiFetch<AgentLite[]>('/agents').catch(() => [] as AgentLite[]),
  ]);

  const total = countRes.total;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const hasFilters = Boolean(params.status || params.search);
  const rangeFrom = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const rangeTo = Math.min(total, safePage * perPage);

  return (
    <div className="space-y-6">
      <TabBar items={CRM_TABS} />
      <PageHeader
        title="Leads"
        description={
          total === 0
            ? hasFilters
              ? 'Ningún lead coincide con los filtros.'
              : 'Sin leads todavía. Da de alta uno o importa CSV.'
            : `${total} ${total === 1 ? 'lead en total' : 'leads en total'} · mostrando ${rangeFrom}–${rangeTo}.`
        }
        action={
          <LeadsTopActions
            agents={agents}
            total={total}
            filterQs={filterQs.toString()}
          />
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
              {LEAD_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Por página</span>
            <select
              name="perPage"
              defaultValue={String(perPage)}
              className="mt-1 rounded-md border border-ink-300 px-2 py-1.5"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
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
        <>
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
                  <tr
                    key={l.id}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/app/leads/${l.id}`}
                        className="font-medium text-ink-900 hover:text-primary-700"
                      >
                        {l.name}
                        {l.lastName && <span className="ml-1 font-normal text-ink-700">{l.lastName}</span>}
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
          <LeadsPagination
            page={safePage}
            totalPages={totalPages}
            perPage={perPage}
            total={total}
            filterQs={filterQs.toString()}
          />
        </>
      )}
    </div>
  );
}
