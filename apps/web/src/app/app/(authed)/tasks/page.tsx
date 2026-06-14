import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TaskActions } from './task-actions';
import {
  TASK_STATUS,
  TASK_STATUS_COLOR,
  TASK_TYPE,
  PRIORITY,
  PRIORITY_COLOR,
  statusColor,
  statusLabel,
} from '@/lib/labels';

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
  owner: { id: string; name: string } | null;
}

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
  const hasFilters = Boolean(params.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tareas"
        description={
          <>
            {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}. Las marcadas con{' '}
            <span className="font-mono">auto</span> las generan tus agentes IA.
          </>
        }
        action={
          <Link href="/app/tasks/new" className={buttonClass('primary')}>
            + Nueva tarea
          </Link>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
          <label className="flex flex-col">
            <span className="text-xs text-ink-500">Estado</span>
            <select
              name="status"
              defaultValue={params.status ?? ''}
              className="mt-1 rounded-md border border-ink-300 px-2 py-1.5"
            >
              <option value="">Todas</option>
              {Object.entries(TASK_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClass('primary')}>
            Filtrar
          </button>
        </form>
      </Card>

      {tasks.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="Sin resultados"
            description="Ninguna tarea coincide con los filtros."
            cta={
              <Link href="/app/tasks" className={buttonClass('secondary', 'text-xs')}>
                Quitar filtros
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Sin tareas"
            description="Crea una manualmente o deja que tus agentes IA las propongan al detectar próximos pasos."
            cta={
              <Link href="/app/tasks/new" className={buttonClass('primary', 'text-xs')}>
                + Nueva tarea
              </Link>
            }
          />
        )
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Tarea</th>
                <th className="hidden px-4 py-3 md:table-cell">Tipo</th>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3">Estado</th>
                <th className="hidden px-4 py-3 md:table-cell">Vinculado</th>
                <th className="hidden px-4 py-3 lg:table-cell">Responsable</th>
                <th className="hidden px-4 py-3 md:table-cell">Vence</th>
                <th className="hidden px-4 py-3 lg:table-cell">Origen</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="hidden px-4 py-3 text-xs md:table-cell">
                    {statusLabel(TASK_TYPE, t.type)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor(PRIORITY_COLOR, t.priority)}>
                      {statusLabel(PRIORITY, t.priority)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor(TASK_STATUS_COLOR, t.status)}>
                      {statusLabel(TASK_STATUS, t.status)}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 text-xs md:table-cell">
                    {t.lead && (
                      <Link href={`/app/leads/${t.lead.id}`} className="text-primary-700 hover:underline">
                        {t.lead.name}
                      </Link>
                    )}
                    {t.client && (
                      <Link href={`/app/clients/${t.client.id}`} className="text-primary-700 hover:underline">
                        {t.client.name}
                      </Link>
                    )}
                    {t.opportunity && (
                      <Link
                        href={`/app/opportunities/${t.opportunity.id}`}
                        className="text-primary-700 hover:underline"
                      >
                        {t.opportunity.name}
                      </Link>
                    )}
                    {!t.lead && !t.client && !t.opportunity && '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-xs lg:table-cell">
                    {t.owner ? t.owner.name : <span className="text-ink-400">Sin asignar</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-xs md:table-cell">
                    {t.dueAt ? new Date(t.dueAt).toLocaleDateString('es-ES') : '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-xs font-mono text-ink-500 lg:table-cell">{t.source}</td>
                  <td className="px-4 py-3 text-right">
                    <TaskActions taskId={t.id} status={t.status} />
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
