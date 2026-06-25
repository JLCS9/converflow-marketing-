import { serverApiFetch } from '@/lib/server-api';
import { TasksWorkspace, type Task, type Stats } from './tasks-workspace';

export const metadata = { title: 'Tareas' };

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
