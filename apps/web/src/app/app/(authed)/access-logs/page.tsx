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
}

export const metadata = { title: 'Logs de acceso' };

export default async function AccessLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  qs.set('limit', '200');

  const logs = await serverApiFetch<LogRow[]>(`/access-logs?${qs.toString()}`);

  const exportQs = new URLSearchParams();
  if (params.from) exportQs.set('from', params.from);
  if (params.to) exportQs.set('to', params.to);
  const exportUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/access-logs/export.csv?${exportQs.toString()}`;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Logs de acceso</h1>
          <p className="mt-1 text-sm text-ink-500">
            Registro inmutable de actividad en tu tenant. Evidencia para Kit Digital
            (categoría Gestión de Procesos con IA / Gestión de Clientes).
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
        <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Desde</span>
            <input
              type="date"
              name="from"
              defaultValue={params.from ?? ''}
              className="mt-1 rounded-md border-ink-300"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Hasta</span>
            <input
              type="date"
              name="to"
              defaultValue={params.to ?? ''}
              className="mt-1 rounded-md border-ink-300"
            />
          </label>
          <button type="submit" className={buttonClass('primary')}>
            Filtrar
          </button>
          <span className="ml-auto text-xs text-ink-500">
            Mostrando {logs.length} entradas (máx 200, usa export CSV para más).
          </span>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-xs">
          <thead className="border-b border-ink-100 text-left font-mono uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Recurso</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                <td className="px-4 py-3 font-mono">
                  {new Date(l.createdAt).toLocaleString('es-ES')}
                </td>
                <td className="px-4 py-3">{l.email}</td>
                <td className="px-4 py-3 font-mono">{l.action}</td>
                <td className="px-4 py-3 font-mono text-ink-500">{l.resource ?? '—'}</td>
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
