import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TabBar, IA_TABS } from '@/components/ui/tab-bar';
import { BOT_STATUS, BOT_STATUS_COLOR, CHANNEL, statusColor, statusLabel } from '@/lib/labels';

interface BotRow {
  id: string;
  name: string;
  channel: string;
  phoneNumber: string | null;
  status: string;
  agentId: string | null;
  lastConnectedAt: string | null;
  createdAt: string;
}

export const metadata = { title: 'Bots' };

export default async function BotsPage() {
  const bots = await serverApiFetch<BotRow[]>('/bots');

  return (
    <div className="space-y-6">
      <TabBar items={IA_TABS} />
      <PageHeader
        title="Bots"
        description={`${bots.length} ${bots.length === 1 ? 'bot configurado' : 'bots configurados'}.`}
        action={
          <Link href="/app/bots/new" className={buttonClass('primary')}>
            + Nuevo bot
          </Link>
        }
      />

      {bots.length === 0 ? (
        <EmptyState
          title="Aún no tienes bots"
          description="Conecta WhatsApp, Web Chat o Email para empezar a recibir mensajes. Tras crearlo, ábrelo y pulsa Conectar."
          cta={
            <Link href="/app/bots/new" className={buttonClass('primary', 'text-xs')}>
              + Crear primer bot
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Estado</th>
                <th className="hidden px-4 py-3 md:table-cell">Número</th>
                <th className="hidden px-4 py-3 md:table-cell">Última conexión</th>
                <th className="hidden px-4 py-3 lg:table-cell">Creado</th>
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => (
                <tr key={b.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/app/bots/${b.id}`} className="text-primary-700 hover:underline">
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs">{statusLabel(CHANNEL, b.channel)}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor(BOT_STATUS_COLOR, b.status)}>
                      {statusLabel(BOT_STATUS, b.status)}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 text-xs font-mono text-ink-500 md:table-cell">
                    {b.phoneNumber ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-ink-500 md:table-cell">
                    {b.lastConnectedAt
                      ? new Date(b.lastConnectedAt).toLocaleString('es-ES')
                      : '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-ink-500 lg:table-cell">
                    {new Date(b.createdAt).toLocaleDateString('es-ES')}
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
