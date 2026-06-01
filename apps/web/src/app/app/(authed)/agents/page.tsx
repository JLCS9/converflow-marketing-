import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TabBar, IA_TABS } from '@/components/ui/tab-bar';
import { AGENT_STATUS, AGENT_STATUS_COLOR, statusColor, statusLabel } from '@/lib/labels';

interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  model: string;
  status: string;
  type: 'CONVERSATIONAL' | 'OPPORTUNITIES' | 'UTILITY';
  template: string | null;
  updatedAt: string;
}

const TYPE_LABEL: Record<AgentRow['type'], string> = {
  CONVERSATIONAL: 'Conversacional',
  OPPORTUNITIES: 'Oportunidades',
  UTILITY: 'Utilidad',
};
const TYPE_COLOR: Record<AgentRow['type'], 'green' | 'blue' | 'yellow'> = {
  CONVERSATIONAL: 'green',
  OPPORTUNITIES: 'blue',
  UTILITY: 'yellow',
};

export const metadata = { title: 'Agentes IA' };

export default async function AgentsPage() {
  const agents = await serverApiFetch<AgentRow[]>('/agents');

  return (
    <div className="space-y-6">
      <TabBar items={IA_TABS} />
      <PageHeader
        title="Agentes IA"
        description="Crea asistentes con tu información, pruébalos y asígnalos a un bot."
        action={
          <Link href="/app/agents/new" className={buttonClass('primary')}>
            + Nuevo agente
          </Link>
        }
      />

      {agents.length === 0 ? (
        <EmptyState
          title="Aún no tienes agentes"
          description="Un agente reúne tu prompt, herramientas y conocimiento para conversar con tus contactos. Empieza por uno y pruébalo con el probador."
          cta={
            <Link href="/app/agents/new" className={buttonClass('primary', 'text-xs')}>
              + Nuevo agente
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="hidden px-4 py-3 md:table-cell">Actualizado</th>
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
                    <Badge color={TYPE_COLOR[a.type ?? 'CONVERSATIONAL']}>
                      {TYPE_LABEL[a.type ?? 'CONVERSATIONAL']}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor(AGENT_STATUS_COLOR, a.status)}>
                      {statusLabel(AGENT_STATUS, a.status)}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-ink-500 md:table-cell">
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
