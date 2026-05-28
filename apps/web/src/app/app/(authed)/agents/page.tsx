import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';

interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  model: string;
  status: string;
  updatedAt: string;
}

const statusColor: Record<string, 'gray' | 'green' | 'yellow' | 'red' | 'blue'> = {
  DRAFT: 'gray',
  PUBLISHED: 'green',
  ARCHIVED: 'red',
};
const statusLabel: Record<string, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

export const metadata = { title: 'Agentes IA' };

export default async function AgentsPage() {
  const agents = await serverApiFetch<AgentRow[]>('/agents');

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agentes IA</h1>
          <p className="mt-1 text-sm text-ink-500">
            Crea asistentes con tu información, pruébalos y asígnalos a un bot de WhatsApp.
          </p>
        </div>
        <Link href="/app/agents/new" className={buttonClass('primary')}>
          + Nuevo agente
        </Link>
      </header>

      {agents.length === 0 ? (
        <Card className="text-center text-ink-500">
          Aún no tienes agentes. Crea uno para empezar.
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3">
                    <Link href={`/app/agents/${a.id}`} className="font-medium text-primary-700 hover:underline">
                      {a.name}
                    </Link>
                    {a.description && <div className="text-xs text-ink-500">{a.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor[a.status] ?? 'gray'}>{statusLabel[a.status] ?? a.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">{a.model}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {new Date(a.updatedAt).toLocaleDateString('es-ES')}
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
