import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';

interface OppRow {
  id: string;
  name: string;
  amount: string | null;
  currency: string;
  status: string;
  probability: number;
  expectedCloseDate: string | null;
  createdAt: string;
  lead: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
}

const statusColor: Record<string, 'gray' | 'green' | 'yellow' | 'red' | 'blue'> = {
  OPEN: 'gray',
  QUOTED: 'blue',
  NEGOTIATING: 'yellow',
  WON: 'green',
  LOST: 'red',
};

export const metadata = { title: 'Oportunidades' };

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);

  const [opps, pipeline] = await Promise.all([
    serverApiFetch<OppRow[]>(`/opportunities?${qs.toString()}`),
    serverApiFetch<Array<{ status: string; count: number; amount: string }>>(
      '/opportunities/pipeline',
    ),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Oportunidades</h1>
          <p className="mt-1 text-sm text-ink-500">{opps.length} oportunidades.</p>
        </div>
        <Link href="/app/opportunities/new" className={buttonClass('primary')}>
          + Nueva oportunidad
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-5">
        {(['OPEN', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST'] as const).map((s) => {
          const stage = pipeline.find((p) => p.status === s);
          return (
            <Link
              key={s}
              href={`/app/opportunities?status=${s}`}
              className="rounded-lg border border-ink-100 bg-white p-4 hover:border-ink-300"
            >
              <div className="flex items-center justify-between">
                <Badge color={statusColor[s]}>{s}</Badge>
                <span className="font-mono text-xs text-ink-500">{stage?.count ?? 0}</span>
              </div>
              <div className="mt-2 text-sm font-medium">
                {stage?.amount ? `${Number(stage.amount).toLocaleString('es-ES')} €` : '—'}
              </div>
            </Link>
          );
        })}
      </section>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Lead / Cliente</th>
              <th className="px-4 py-3">Importe</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Prob.</th>
              <th className="px-4 py-3">Cierre esperado</th>
            </tr>
          </thead>
          <tbody>
            {opps.map((o) => (
              <tr key={o.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                <td className="px-4 py-3">
                  <Link href={`/app/opportunities/${o.id}`} className="font-medium text-ink-900 hover:text-primary-700">
                    {o.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs">
                  {o.client ? o.client.name : o.lead ? `Lead: ${o.lead.name}` : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {o.amount ? `${Number(o.amount).toLocaleString('es-ES')} ${o.currency}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge color={statusColor[o.status] ?? 'gray'}>{o.status}</Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{o.probability}%</td>
                <td className="px-4 py-3 text-xs text-ink-500">
                  {o.expectedCloseDate
                    ? new Date(o.expectedCloseDate).toLocaleDateString('es-ES')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
