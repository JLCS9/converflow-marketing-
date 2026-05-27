import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge } from '@/components/ui/primitives';

interface AdminBotRow {
  id: string;
  name: string;
  channel: string;
  status: string;
  phoneNumber: string | null;
  lastConnectedAt: string | null;
  createdAt: string;
  tenant: { id: string; name: string; slug: string };
}

const statusColor: Record<string, 'gray' | 'green' | 'yellow' | 'red'> = {
  PENDING: 'gray',
  AWAITING_QR: 'yellow',
  CONNECTING: 'yellow',
  CONNECTED: 'green',
  DISCONNECTED: 'red',
  BANNED: 'red',
  ERROR: 'red',
};

const channelLabel: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  WEBCHAT: 'Web Chat',
};

export const metadata = { title: 'Admin · Bots' };

export default async function AdminBotsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tenantId?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.tenantId) qs.set('tenantId', params.tenantId);

  const bots = await serverApiFetch<AdminBotRow[]>(
    `/admin/bots${qs.toString() ? '?' + qs.toString() : ''}`,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Bots globales</h1>
        <p className="mt-1 text-sm text-ink-500">
          Todos los bots de la plataforma. {bots.length}{' '}
          {bots.length === 1 ? 'bot' : 'bots'} (mostrando hasta 200).
        </p>
      </header>

      <Card>
        <form className="flex flex-wrap gap-3 text-sm" method="get">
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Status</span>
            <select
              name="status"
              defaultValue={params.status ?? ''}
              className="mt-1 rounded border-ink-300"
            >
              <option value="">Todos</option>
              <option value="PENDING">PENDING</option>
              <option value="AWAITING_QR">AWAITING_QR</option>
              <option value="CONNECTING">CONNECTING</option>
              <option value="CONNECTED">CONNECTED</option>
              <option value="DISCONNECTED">DISCONNECTED</option>
              <option value="BANNED">BANNED</option>
              <option value="ERROR">ERROR</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col">
            <span className="text-xs text-ink-500">Tenant ID (opcional)</span>
            <input
              type="text"
              name="tenantId"
              defaultValue={params.tenantId ?? ''}
              placeholder="cmp..."
              className="mt-1 rounded border-ink-300 font-mono text-xs"
            />
          </label>
          <button
            type="submit"
            className="mt-5 self-start rounded-md border border-ink-300 px-3 py-1.5 text-sm hover:bg-ink-100"
          >
            Filtrar
          </button>
        </form>
      </Card>

      {bots.length === 0 ? (
        <Card className="text-center text-ink-500">Sin bots con esos filtros.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Bot</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Última conexión</th>
                <th className="px-4 py-3">Creado</th>
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => (
                <tr key={b.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3 text-xs">
                    <Link
                      href={`/admin/tenants/${b.tenant.id}`}
                      className="text-primary-700 hover:underline"
                    >
                      {b.tenant.name}
                    </Link>{' '}
                    <span className="font-mono text-ink-500">/ {b.tenant.slug}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{channelLabel[b.channel] ?? b.channel}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor[b.status] ?? 'gray'}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">
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
