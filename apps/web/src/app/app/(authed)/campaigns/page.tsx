import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  status: string;
  scheduledAt: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
}

export const metadata = { title: 'Campañas' };

const CHANNEL_LABEL: Record<string, string> = { EMAIL: 'Email', WHATSAPP: 'WhatsApp' };
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

export default async function CampaignsPage() {
  const campaigns = await serverApiFetch<CampaignRow[]>('/campaigns').catch(() => [] as CampaignRow[]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campañas"
        description="Envíos masivos a grupos de leads y clientes. Email disponible; WhatsApp y otros canales según el bot conectado."
        action={
          <Link href="/app/campaigns/new" className={buttonClass('primary')}>
            + Nueva campaña
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="Sin campañas"
          description="Crea tu primera campaña para enviar un email a un grupo de contactos."
          cta={
            <Link href="/app/campaigns/new" className={buttonClass('primary', 'text-xs')}>
              + Nueva campaña
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Campaña</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Destinatarios</th>
                <th className="hidden px-4 py-3 md:table-cell">Programada</th>
                <th className="px-4 py-3 text-right">—</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-xs">{CHANNEL_LABEL[c.channel] ?? c.channel}</td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLOR[c.status] ?? 'gray'}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.status === 'DRAFT'
                      ? '—'
                      : `${c.sentCount}/${c.totalRecipients}${c.failedCount ? ` · ${c.failedCount} fallidos` : ''}`}
                  </td>
                  <td className="hidden px-4 py-3 text-xs md:table-cell">
                    {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString('es-ES') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/app/campaigns/${c.id}`}
                      className="text-xs text-primary-700 hover:underline"
                    >
                      Abrir →
                    </Link>
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
