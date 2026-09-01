import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TabBar, CRM_TABS } from '@/components/ui/tab-bar';
import {
  LEAD_STATUS,
  LEAD_STATUS_COLOR,
  CLIENT_STATUS,
  CLIENT_STATUS_COLOR,
  statusColor,
  statusLabel,
} from '@/lib/labels';
import { ContactsFilters, type OwnerOption } from './contacts-filters';

/**
 * Página unificada de contactos: leads y clientes en una sola lista con filtros
 * combinables reflejados en la URL (compartible: abrir el enlace reproduce la
 * vista). Sustituye a las páginas separadas /app/leads y /app/clients, que
 * redirigen aquí conservando sus filtros.
 */

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

interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
}

/** Fila normalizada: las dos entidades pintadas con las mismas columnas. */
interface ContactRow {
  kind: 'lead' | 'client';
  id: string;
  href: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: string;
  statusLabel: string;
  statusColor: string;
  score: number | null;
  createdAt: string;
}

const PAGE_SIZE = 50;

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('contacts.title') };
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    status?: string;
    source?: string;
    ownerId?: string;
    createdFrom?: string;
    createdTo?: string;
    scoreMin?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const t = await getTranslations();
  const params = await searchParams;
  const type = params.type === 'lead' || params.type === 'client' ? params.type : 'all';
  const page = Math.max(1, Number(params.page) || 1);

  // Los filtros específicos de lead (origen, responsable, score) solo viajan a
  // /leads: el modelo Client no los tiene. Con tipo=client se ignoran, y la UI
  // los deshabilita para que no parezca que filtran.
  const leadQs = new URLSearchParams({ limit: String(PAGE_SIZE * 2) });
  const clientQs = new URLSearchParams({ limit: String(PAGE_SIZE * 2) });
  for (const [k, v] of Object.entries({
    status: params.status,
    search: params.search,
  })) {
    if (v) {
      leadQs.set(k, v);
      clientQs.set(k, v);
    }
  }
  for (const [k, v] of Object.entries({
    source: params.source,
    ownerId: params.ownerId,
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
    scoreMin: params.scoreMin,
  })) {
    if (v) leadQs.set(k, v);
  }
  // El estado es por entidad: un status de lead no aplica a clientes y viceversa.
  const leadStatusValid = params.status ? params.status in LEAD_STATUS : true;
  const clientStatusValid = params.status ? params.status in CLIENT_STATUS : true;

  const wantLeads = type !== 'client' && leadStatusValid;
  const wantClients =
    type !== 'lead' &&
    clientStatusValid &&
    // Filtros exclusivos de lead activos → los clientes no pueden cumplirlos.
    !params.source &&
    !params.ownerId &&
    !params.scoreMin;

  const [leads, clients, owners] = await Promise.all([
    wantLeads
      ? serverApiFetch<LeadRow[]>(`/leads?${leadQs}`).catch(() => [] as LeadRow[])
      : Promise.resolve([] as LeadRow[]),
    wantClients
      ? serverApiFetch<ClientRow[]>(`/clients?${clientQs}`).catch(() => [] as ClientRow[])
      : Promise.resolve([] as ClientRow[]),
    serverApiFetch<OwnerOption[]>('/users/assignable').catch(() => [] as OwnerOption[]),
  ]);

  // El endpoint de clientes no filtra por fechas: se aplica aquí. Volumen Pyme.
  const from = params.createdFrom ? new Date(`${params.createdFrom}T00:00:00`) : null;
  const to = params.createdTo ? new Date(`${params.createdTo}T23:59:59`) : null;
  const inRange = (iso: string) => {
    const d = new Date(iso);
    return (!from || d >= from) && (!to || d <= to);
  };

  const rows: ContactRow[] = [
    ...leads.map(
      (l): ContactRow => ({
        kind: 'lead',
        id: l.id,
        href: `/app/leads/${l.id}`,
        name: [l.name, l.lastName].filter(Boolean).join(' '),
        email: l.email,
        phone: l.phone,
        company: l.company,
        source: l.source,
        status: l.status,
        statusLabel: statusLabel(LEAD_STATUS, l.status),
        statusColor: statusColor(LEAD_STATUS_COLOR, l.status),
        score: l.score,
        createdAt: l.createdAt,
      }),
    ),
    ...clients.filter((c) => inRange(c.createdAt)).map(
      (c): ContactRow => ({
        kind: 'client',
        id: c.id,
        href: `/app/clients/${c.id}`,
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: null,
        source: null,
        status: c.status,
        statusLabel: statusLabel(CLIENT_STATUS, c.status),
        statusColor: statusColor(CLIENT_STATUS_COLOR, c.status),
        score: null,
        createdAt: c.createdAt,
      }),
    ),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasFilters = Boolean(
    params.status || params.source || params.ownerId || params.createdFrom ||
    params.createdTo || params.scoreMin || params.search || type !== 'all',
  );

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      <TabBar items={CRM_TABS} />
      <PageHeader
        title={t('contacts.title')}
        description={t('contacts.subtitle')}
        action={
          <div className="flex gap-2">
            {/* El botón «Score IA en masa» se retira de la UI a propósito: el
                módulo de IA se va a rediseñar. El backend de scoring sigue. */}
            <Link href="/app/leads/import" className={buttonClass('secondary', 'text-xs')}>
              ⤒ {t('leads.importCsv')}
            </Link>
            <Link href="/app/leads/new" className={buttonClass('primary', 'text-xs')}>
              + {t('leads.newLead')}
            </Link>
          </div>
        }
      />

      <ContactsFilters owners={owners} />

      {rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? t('crm.noResults') : t('contacts.emptyTitle')}
          description={hasFilters ? t('contacts.noMatch') : t('contacts.emptyBody')}
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left font-mono text-[11px] uppercase tracking-wider text-ink-400">
                <th className="px-4 py-2.5">{t('crm.name')}</th>
                <th className="px-3 py-2.5">{t('contacts.type')}</th>
                <th className="px-3 py-2.5">{t('crm.email')}</th>
                <th className="hidden px-3 py-2.5 md:table-cell">{t('crm.phone')}</th>
                <th className="px-3 py-2.5">{t('crm.status')}</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">{t('crm.source')}</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">Score</th>
                <th className="px-3 py-2.5 text-right">{t('crm.createdAt')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/30">
                  <td className="px-4 py-2.5">
                    <Link href={r.href} className="font-medium text-ink-900 hover:text-primary-700">
                      {r.name}
                    </Link>
                    {r.company && <div className="text-xs text-ink-400">{r.company}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={r.kind === 'client' ? 'green' : 'blue'}>
                      {r.kind === 'client' ? t('contacts.client') : 'Lead'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-ink-600">{r.email ?? '—'}</td>
                  <td className="hidden px-3 py-2.5 text-ink-600 md:table-cell">{r.phone ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <Badge color={r.statusColor as never}>{r.statusLabel}</Badge>
                  </td>
                  <td className="hidden px-3 py-2.5 text-ink-500 lg:table-cell">{r.source ?? '—'}</td>
                  <td className="hidden px-3 py-2.5 font-mono text-xs text-ink-600 lg:table-cell">
                    {r.score ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-ink-500">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
