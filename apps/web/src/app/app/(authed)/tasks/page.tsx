import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { TaskActions } from './task-actions';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  dueAt: string | null;
  completedAt: string | null;
  source: string;
  createdAt: string;
  lead: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
}

const statusColor: Record<string, 'gray' | 'yellow' | 'green' | 'red' | 'blue'> = {
  PENDING: 'gray',
  IN_PROGRESS: 'yellow',
  DONE: 'green',
  CANCELLED: 'red',
};

const priorityColor: Record<string, 'gray' | 'yellow' | 'red'> = {
  LOW: 'gray',
  MEDIUM: 'gray',
  HIGH: 'yellow',
  URGENT: 'red',
};

export const metadata = { title: 'Tareas' };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);

  const tasks = await serverApiFetch<TaskRow[]>(`/tasks?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
          <p className="mt-1 text-sm text-ink-500">
            {tasks.length} tareas. Las marcadas con <span className="font-mono">auto</span> las generan tus agentes IA.
          </p>
        </div>
        <Link href="/app/tasks/new" className={buttonClass('primary')}>
          + Nueva tarea
        </Link>
      </header>

      <Card>
        <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Status</span>
            <select name="status" defaultValue={params.status ?? ''} className="mt-1 rounded border-ink-300">
              <option value="">Todas</option>
              <option value="PENDING">PENDING</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="DONE">DONE</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </label>
          <button type="submit" className={buttonClass('primary')}>Filtrar</button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-3">Tarea</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Prioridad</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Vinculado</th>
              <th className="px-4 py-3">Vence</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                <td className="px-4 py-3 font-medium">{t.title}</td>
                <td className="px-4 py-3 text-xs">{t.type}</td>
                <td className="px-4 py-3"><Badge color={priorityColor[t.priority] ?? 'gray'}>{t.priority}</Badge></td>
                <td className="px-4 py-3"><Badge color={statusColor[t.status] ?? 'gray'}>{t.status}</Badge></td>
                <td className="px-4 py-3 text-xs">
                  {t.lead && <Link href={`/app/leads/${t.lead.id}`} className="text-primary-700 hover:underline">{t.lead.name}</Link>}
                  {t.client && <Link href={`/app/clients/${t.client.id}`} className="text-primary-700 hover:underline">{t.client.name}</Link>}
                  {t.opportunity && <Link href={`/app/opportunities/${t.opportunity.id}`} className="text-primary-700 hover:underline">{t.opportunity.name}</Link>}
                  {!t.lead && !t.client && !t.opportunity && '—'}
                </td>
                <td className="px-4 py-3 text-xs">
                  {t.dueAt ? new Date(t.dueAt).toLocaleDateString('es-ES') : '—'}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-ink-500">{t.source}</td>
                <td className="px-4 py-3 text-right">
                  <TaskActions taskId={t.id} status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
