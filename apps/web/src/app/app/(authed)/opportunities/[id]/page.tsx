import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { Card, Badge } from '@/components/ui/primitives';
import { OpportunityActions } from './opportunity-actions';

interface OppDetail {
  id: string;
  name: string;
  amount: string | null;
  currency: string;
  status: string;
  probability: number;
  expectedCloseDate: string | null;
  closedAt: string | null;
  ownerId: string | null;
  proposalUrl: string | null;
  createdAt: string;
  updatedAt: string;
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

export const metadata = { title: 'Oportunidad' };

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let opp: OppDetail;
  try {
    opp = await serverApiFetch<OppDetail>(`/opportunities/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/opportunities" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver
        </Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{opp.name}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm">
              <Badge color={statusColor[opp.status] ?? 'gray'}>{opp.status}</Badge>
              {opp.amount && (
                <span className="font-mono text-xs">
                  {Number(opp.amount).toLocaleString('es-ES')} {opp.currency}
                </span>
              )}
              <span className="font-mono text-xs text-ink-500">{opp.probability}% prob</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Información</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {opp.lead && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Lead</dt>
                <dd>
                  <Link href={`/app/leads/${opp.lead.id}`} className="text-primary-700 hover:underline">
                    {opp.lead.name}
                  </Link>
                </dd>
              </div>
            )}
            {opp.client && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Cliente</dt>
                <dd>{opp.client.name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Cierre esperado</dt>
              <dd>
                {opp.expectedCloseDate
                  ? new Date(opp.expectedCloseDate).toLocaleDateString('es-ES')
                  : '—'}
              </dd>
            </div>
            {opp.closedAt && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Cerrada</dt>
                <dd>{new Date(opp.closedAt).toLocaleString('es-ES')}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Acciones</h2>
          <div className="mt-4">
            <OpportunityActions
              opportunityId={opp.id}
              currentStatus={opp.status as never}
              currentProbability={opp.probability}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
