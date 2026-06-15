import { notFound } from 'next/navigation';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, StatCard } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { CampaignForm, type CampaignData } from '../campaign-form';
import { CampaignActions } from './campaign-actions';

interface Recipient {
  id: string;
  name: string | null;
  address: string;
  status: string;
  error: string | null;
  sentAt: string | null;
}
interface CampaignDetail extends CampaignData {
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  completedAt: string | null;
  recipients: Recipient[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SCHEDULED: 'Programada',
  SENDING: 'Enviando',
  SENT: 'Enviada',
  CANCELLED: 'Cancelada',
  FAILED: 'Fallida',
};
type BadgeColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow';
const STATUS_COLOR: Record<string, BadgeColor> = {
  DRAFT: 'gray',
  SCHEDULED: 'blue',
  SENDING: 'yellow',
  SENT: 'green',
  CANCELLED: 'gray',
  FAILED: 'red',
};
const REC_COLOR: Record<string, BadgeColor> = {
  PENDING: 'gray',
  SENT: 'green',
  FAILED: 'red',
  SKIPPED: 'yellow',
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await serverApiFetch<CampaignDetail>(`/campaigns/${id}`).catch(() => null);
  if (!c) notFound();

  const editable = c.status === 'DRAFT' || c.status === 'SCHEDULED';

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        description={
          <span className="inline-flex items-center gap-2">
            <Badge color={STATUS_COLOR[c.status] ?? 'gray'}>
              {STATUS_LABEL[c.status] ?? c.status}
            </Badge>
            <span className="text-ink-500">{c.channel === 'EMAIL' ? 'Email' : 'WhatsApp'}</span>
          </span>
        }
        back={{ href: '/app/campaigns', label: 'Campañas' }}
        action={<CampaignActions id={c.id} status={c.status} />}
      />

      {editable ? (
        <CampaignForm campaign={c} />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Destinatarios" value={c.totalRecipients} />
            <StatCard label="Enviados" value={c.sentCount} />
            <StatCard label="Fallidos" value={c.failedCount} />
          </section>

          <Card>
            <h3 className="mb-3 text-sm font-mono uppercase tracking-wider text-ink-500">Mensaje</h3>
            {c.subject && <div className="mb-1 text-sm font-medium">{c.subject}</div>}
            <pre className="whitespace-pre-wrap font-sans text-sm text-ink-700">{c.body}</pre>
          </Card>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-4 py-3">Destinatario</th>
                  <th className="px-4 py-3">Dirección</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="hidden px-4 py-3 md:table-cell">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {c.recipients.map((r) => (
                  <tr key={r.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-2">{r.name ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.address}</td>
                    <td className="px-4 py-2">
                      <Badge color={REC_COLOR[r.status] ?? 'gray'}>{r.status}</Badge>
                    </td>
                    <td className="hidden px-4 py-2 text-xs text-ink-500 md:table-cell">
                      {r.error
                        ? r.error
                        : r.sentAt
                          ? new Date(r.sentAt).toLocaleString('es-ES')
                          : '—'}
                    </td>
                  </tr>
                ))}
                {c.recipients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink-500">
                      Sin destinatarios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
