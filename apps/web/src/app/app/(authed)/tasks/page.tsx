import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { TasksWorkspace, type Task, type Stats } from './tasks-workspace';

// metadata estática no puede traducirse: se genera por petición para que la
// pestaña del navegador siga el idioma del usuario.
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('tasks.title') };
}

const EMPTY_STATS: Stats = { pending: 0, overdue: 0, doneThisWeek: 0 };

export default async function TasksPage() {
  const [tasks, stats, assignees] = await Promise.all([
    serverApiFetch<Task[]>('/tasks?limit=200').catch(() => [] as Task[]),
    serverApiFetch<Stats>('/tasks/stats').catch(() => EMPTY_STATS),
    serverApiFetch<{ id: string; name: string }[]>('/tasks/assignees').catch(
      () => [] as { id: string; name: string }[],
    ),
  ]);

  return <TasksWorkspace initialTasks={tasks} initialStats={stats} assignees={assignees} />;
}
