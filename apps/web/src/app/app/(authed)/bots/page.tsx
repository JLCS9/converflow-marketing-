import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';

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

const channelLabel: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  WEBCHAT: 'Web Chat',
};

const statusColor: Record<string, 'gray' | 'green' | 'yellow' | 'red' | 'blue'> = {
  PENDING: 'gray',
  AWAITING_QR: 'yellow',
  CONNECTING: 'yellow',
  CONNECTED: 'green',
  DISCONNECTED: 'red',
  BANNED: 'red',
  ERROR: 'red',
};

export const metadata = { title: 'Bots' };

export default async function BotsPage() {
  const bots = await serverApiFetch<BotRow[]>('/bots');

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bots</h1>
          <p className="mt-1 text-sm text-ink-500">
            {bots.length} {bots.length === 1 ? 'bot' : 'bots'} configurados.
          </p>
        </div>
        <Link href="/app/bots/new" className={buttonClass('primary')}>
          + Nuevo bot
        </Link>
      </header>

      {bots.length === 0 ? (
        <Card className="text-center">
          <p className="text-ink-500">
            Aún no tienes bots. Crea uno para empezar a conectar tus canales.
          </p>
          <div className="mt-4">
            <Link href="/app/bots/new" className={buttonClass('primary')}>
              + Crear primer bot
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Tras crear un bot de WhatsApp, ábrelo y pulsa <strong>Conectar</strong> para
            escanear el QR desde tu teléfono.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Última conexión</th>
                <th className="px-4 py-3">Creado</th>
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
                  <td className="px-4 py-3 text-xs">{channelLabel[b.channel] ?? b.channel}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor[b.status] ?? 'gray'}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-ink-500">
                    {b.phoneNumber ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {b.lastConnectedAt
                      ? new Date(b.lastConnectedAt).toLocaleString('es-ES')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
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
