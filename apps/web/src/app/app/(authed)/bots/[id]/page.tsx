import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { BotConnection } from './bot-connection';
import { BotAgentSelect } from './bot-agent-select';
import { BotEmailConnect } from './bot-email-connect';

interface BotDetail {
  id: string;
  name: string;
  channel: string;
  phoneNumber: string | null;
  status: string;
  agentId: string | null;
  maxMessagesPerMinute: number;
  maxMessagesPerHour: number;
  lastConnectedAt: string | null;
  lastDisconnectAt: string | null;
  lastDisconnectReason: string | null;
  createdAt: string;
}

const channelLabel: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  WEBCHAT: 'Web Chat',
};

export const metadata = { title: 'Bot' };

export default async function BotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let bot: BotDetail;
  try {
    bot = await serverApiFetch<BotDetail>(`/bots/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const agents = await serverApiFetch<{ id: string; name: string; status: string }[]>(
    '/agents',
  ).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/bots" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a bots
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{bot.name}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {channelLabel[bot.channel] ?? bot.channel}
          {bot.phoneNumber && <> · {bot.phoneNumber}</>}
        </p>
      </div>

      {bot.channel === 'WHATSAPP' ? (
        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Conexión WhatsApp</h2>
          <p className="mt-1 text-xs text-ink-500">
            Vincula tu número escaneando un QR (igual que WhatsApp Web). La sesión queda
            guardada cifrada y se reconecta sola tras un reinicio.
          </p>
          <div className="mt-4">
            <BotConnection botId={bot.id} initialStatus={bot.status} />
          </div>
        </Card>
      ) : bot.channel === 'EMAIL' ? (
        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Conexión Email</h2>
          <p className="mt-1 text-xs text-ink-500">
            Conecta tu propio buzón por IMAP/SMTP. Los emails entrantes entran en Conversaciones y
            las respuestas salen desde tu dirección.
          </p>
          <div className="mt-4">
            <BotEmailConnect botId={bot.id} />
          </div>
        </Card>
      ) : bot.channel === 'WEBCHAT' ? (
        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Web Chat</h2>
          <p className="mt-1 text-xs text-ink-500">
            Embebe el widget en tu web con un iframe a{' '}
            <code className="rounded bg-ink-100 px-1 font-mono text-xs">
              /widget/{bot.id}
            </code>
            . Asigna un agente para que responda automáticamente.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-ink-500">
            Este canal todavía no soporta conexión automática.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Agente IA</h2>
        <p className="mt-1 text-xs text-ink-500">
          Asigna un agente para que gobierne las respuestas de este bot. Crea y configura
          agentes en{' '}
          <Link href="/app/agents" className="text-primary-700 hover:underline">
            Agentes IA
          </Link>
          .
        </p>
        <div className="mt-4">
          <BotAgentSelect botId={bot.id} currentAgentId={bot.agentId} agents={agents} />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Detalles</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Row label="Límite / minuto" value={String(bot.maxMessagesPerMinute)} />
          <Row label="Límite / hora" value={String(bot.maxMessagesPerHour)} />
          <Row
            label="Última conexión"
            value={bot.lastConnectedAt ? new Date(bot.lastConnectedAt).toLocaleString('es-ES') : '—'}
          />
          <Row
            label="Última desconexión"
            value={
              bot.lastDisconnectAt
                ? `${new Date(bot.lastDisconnectAt).toLocaleString('es-ES')}${
                    bot.lastDisconnectReason ? ` (${bot.lastDisconnectReason})` : ''
                  }`
                : '—'
            }
          />
          <Row label="Creado" value={new Date(bot.createdAt).toLocaleString('es-ES')} />
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-1 text-ink-900">{value}</dd>
    </div>
  );
}
