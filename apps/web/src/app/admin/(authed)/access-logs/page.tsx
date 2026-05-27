import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';

interface LogRow {
  id: string;
  email: string;
  userId: string | null;
  action: string;
  resource: string | null;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
  tenant: { id: string; name: string; slug: string } | null;
}

export const metadata = { title: 'Admin · Logs Kit Digital' };

export default async function AdminAccessLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; email?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.tenantId) qs.set('tenantId', params.tenantId);
  if (params.email) qs.set('email', params.email);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  qs.set('limit', '300');

  const logs = await serverApiFetch<LogRow[]>(`/admin/access-logs?${qs.toString()}`);

  const exportQs = new URLSearchParams();
  if (params.tenantId) exportQs.set('tenantId', params.tenantId);
  if (params.from) exportQs.set('from', params.from);
  if (params.to) exportQs.set('to', params.to);
  const exportUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/admin/access-logs/export.csv?${exportQs.toString()}`;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Logs Kit Digital</h1>
          <p className="mt-1 text-sm text-ink-500">
            Auditoría de accesos cross-tenant. Evidencia para justificación Red.es de
            Gestión de Procesos con IA / Gestión de Clientes.
          </p>
        </div>
        <a
          href={exportUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonClass('secondary')}
        >
          ⤓ Exportar CSV
        </a>
      </header>

      <Card>
        <form className="grid gap-3 sm:grid-cols-4 sm:items-end text-sm" method="get">
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Tenant ID</span>
            <input
              type="text"
              name="tenantId"
              defaultValue={params.tenantId ?? ''}
              placeholder="cmp..."
              className="mt-1 rounded border-ink-300 font-mono text-xs"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Email contiene</span>
            <input
              type="text"
              name="email"
              defaultValue={params.email ?? ''}
              placeholder="@cliente.com"
              className="mt-1 rounded border-ink-300"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Desde</span>
            <input type="date" name="from" defaultValue={params.from ?? ''} className="mt-1 rounded border-ink-300" />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Hasta</span>
            <input type="date" name="to" defaultValue={params.to ?? ''} className="mt-1 rounded border-ink-300" />
          </label>
          <button type="submit" className={buttonClass('primary') + ' sm:col-span-4 sm:w-32'}>
            Filtrar
          </button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-xs">
          <thead className="border-b border-ink-100 text-left font-mono uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">OK</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                <td className="px-4 py-3 font-mono">{new Date(l.createdAt).toLocaleString('es-ES')}</td>
                <td className="px-4 py-3 text-xs">
                  {l.tenant ? <span className="font-mono">{l.tenant.slug}</span> : '—'}
                </td>
                <td className="px-4 py-3">{l.email}</td>
                <td className="px-4 py-3 font-mono">{l.action}</td>
                <td className="px-4 py-3 font-mono text-ink-500">{l.ip ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge color={l.success ? 'green' : 'red'}>{l.success ? 'OK' : 'FAIL'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
