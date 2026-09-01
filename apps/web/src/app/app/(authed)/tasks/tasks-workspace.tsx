'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TaskDrawer } from './task-drawer';
import Link from 'next/link';
import {
  Phone,
  Mail,
  CalendarCheck,
  Repeat,
  LifeBuoy,
  CircleDot,
  Plus,
  Pencil,
  Trash2,
  Check,
  LayoutList,
  Columns3,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/session-context';
import { useFeedback } from '@/components/ui/feedback';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { Avatar } from '@/components/ui/inbox-kit';
import {
  TASK_STATUS,
  TASK_STATUS_COLOR,
  TASK_TYPE,
  PRIORITY,
  PRIORITY_COLOR,
  statusColor,
} from '@/lib/labels';

interface Ref {
  id: string;
  name: string;
}
export interface Task {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  dueAt: string | null;
  completedAt: string | null;
  ownerId: string | null;
  source: string;
  lead: Ref | null;
  client: Ref | null;
  opportunity: Ref | null;
  owner: Ref | null;
  createdAt: string;
}
export interface Stats {
  pending: number;
  overdue: number;
  doneThisWeek: number;
}

const TYPE_ICON: Record<string, LucideIcon> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: CalendarCheck,
  FOLLOW_UP: Repeat,
  SUPPORT: LifeBuoy,
  OTHER: CircleDot,
};
const BOARD_COLS = ['PENDING', 'IN_PROGRESS', 'DONE'] as const;
const NEXT_STATUS: Record<string, string> = { PENDING: 'IN_PROGRESS', IN_PROGRESS: 'DONE' };

function dueLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function isOverdue(task: Task): boolean {
  return !!task.dueAt && task.status !== 'DONE' && task.status !== 'CANCELLED' && new Date(task.dueAt) < new Date();
}
function linkedOf(task: Task): { href: string; name: string } | null {
  if (task.lead) return { href: `/app/leads/${task.lead.id}`, name: task.lead.name };
  if (task.client) return { href: `/app/clients/${task.client.id}`, name: task.client.name };
  if (task.opportunity) return { href: `/app/opportunities/${task.opportunity.id}`, name: task.opportunity.name };
  return null;
}

export function TasksWorkspace({
  initialTasks,
  initialStats,
  assignees,
}: {
  initialTasks: Task[];
  initialStats: Stats;
  assignees: Ref[];
}) {
  const t = useTranslations();
  const session = useSession();
  const fb = useFeedback();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [scope, setScope] = useState<'mine' | 'team' | 'all'>('mine');
  const [quick, setQuick] = useState<'today' | 'overdue' | 'unassigned' | null>(null);
  const [statusF, setStatusF] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [typeF, setTypeF] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [modal, setModal] = useState<{ task: Task | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        apiFetch<Task[]>('/tasks?limit=200'),
        apiFetch<Stats>('/tasks/stats').catch(() => initialStats),
      ]);
      setTasks(t);
      setStats(s);
    } catch {
      /* keep last */
    }
  }, [initialStats]);

  const nameOf = (id: string | null) => (id ? assignees.find((a) => a.id === id)?.name ?? 'Asignado' : '');

  async function patch(id: string, data: Record<string, unknown>) {
    setBusyId(id);
    try {
      await apiFetch(`/tasks/${id}`, { method: 'PATCH', json: data });
      await load();
    } catch {
      fb.toast.error('No se pudo actualizar la tarea');
    } finally {
      setBusyId(null);
    }
  }
  async function remove(task: Task) {
    const ok = await fb.confirm({ title: 'Eliminar tarea', description: task.title, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    try {
      await apiFetch(`/tasks/${task.id}`, { method: 'DELETE' });
      fb.toast.success('Tarea eliminada');
      await load();
    } catch {
      fb.toast.error('No se pudo eliminar');
    }
  }

  const startOfToday = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime(), []);
  const endOfToday = startOfToday + 86400000;

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (scope === 'mine' && task.ownerId !== session.userId) return false;
      if (scope === 'team' && !task.ownerId) return false;
      if (statusF && task.status !== statusF) return false;
      if (dueFrom && (!task.dueAt || new Date(task.dueAt) < new Date(dueFrom))) return false;
      if (dueTo && (!task.dueAt || new Date(task.dueAt) > new Date(dueTo + 'T23:59:59'))) return false;
      if (typeF && task.type !== typeF) return false;
      if (quick === 'overdue' && !isOverdue(task)) return false;
      if (quick === 'unassigned' && task.ownerId) return false;
      if (quick === 'today') {
        if (!task.dueAt) return false;
        const d = new Date(task.dueAt).getTime();
        if (d < startOfToday || d >= endOfToday) return false;
      }
      if (q.trim() && !task.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
  }, [tasks, scope, statusF, typeF, quick, q, session.userId, startOfToday, endOfToday, dueFrom, dueTo]);

  const segBtn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'}`;
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs ${active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-100'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tasks.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-ink-200 p-0.5">
            <button type="button" onClick={() => setView('list')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${view === 'list' ? 'bg-ink-100 text-ink-900' : 'text-ink-500'}`}><LayoutList size={14} /> {t('taskBoard.list')}</button>
            <button type="button" onClick={() => setView('board')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${view === 'board' ? 'bg-ink-100 text-ink-900' : 'text-ink-500'}`}><Columns3 size={14} /> {t('taskBoard.board')}</button>
          </div>
          <button type="button" onClick={() => setModal({ task: null })} className={buttonClass('primary', 'flex items-center gap-1.5')}>
            <Plus size={16} /> {t('taskBoard.newTask')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3"><div className="text-xs text-ink-500">{t('tasks.pending')}</div><div className="text-2xl font-semibold">{stats.pending}</div></Card>
        <Card className="p-3"><div className="text-xs text-ink-500">{t('taskBoard.overdue')}</div><div className={`text-2xl font-semibold ${stats.overdue > 0 ? 'text-red-600' : ''}`}>{stats.overdue}</div></Card>
        <Card className="p-3"><div className="text-xs text-ink-500">{t('tasks.doneThisWeek')}</div><div className="text-2xl font-semibold text-green-600">{stats.doneThisWeek}</div></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-ink-100 p-0.5">
          <button type="button" onClick={() => setScope('mine')} className={segBtn(scope === 'mine')}>{t('taskBoard.mine')}</button>
          <button type="button" onClick={() => setScope('team')} className={segBtn(scope === 'team')}>{t('taskBoard.team')}</button>
          <button type="button" onClick={() => setScope('all')} className={segBtn(scope === 'all')}>{t('taskBoard.allScope')}</button>
        </div>
        <button type="button" onClick={() => setQuick(quick === 'today' ? null : 'today')} className={chip(quick === 'today')}>{t('taskBoard.today')}</button>
        <button type="button" onClick={() => setQuick(quick === 'overdue' ? null : 'overdue')} className={chip(quick === 'overdue')}>{t('taskBoard.overdue')}</button>
        <button type="button" onClick={() => setQuick(quick === 'unassigned' ? null : 'unassigned')} className={chip(quick === 'unassigned')}>{t('taskBoard.unassigned')}</button>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded border border-ink-200 py-1 pl-2 pr-7 text-xs">
          <option value="">{t('taskBoard.allStatuses')}</option>
          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="rounded border border-ink-200 py-1 pl-2 pr-7 text-xs">
          <option value="">{t('taskBoard.allTypes')}</option>
          {Object.entries(TASK_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} title="Vence desde" className="rounded border border-ink-200 bg-white px-1.5 py-1 text-xs text-ink-600" />
          <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} title="Vence hasta" className="rounded border border-ink-200 bg-white px-1.5 py-1 text-xs text-ink-600" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('taskBoard.searchPlaceholder')} className="rounded border border-ink-200 py-1 pl-2 pr-7 text-xs" />
      </div>

      {filtered.length === 0 ? (
        <Card className="text-center text-sm text-ink-500">{t('taskBoard.emptyFiltered')}</Card>
      ) : view === 'list' ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <tbody>
              {filtered.map((task) => {
                const Icon = TYPE_ICON[task.type] ?? CircleDot;
                const linked = linkedOf(task);
                const overdue = isOverdue(task);
                return (
                  <tr key={task.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/30">
                    <td className="py-2.5 pl-4 pr-2">
                      <button type="button" onClick={() => void patch(task.id, { status: task.status === 'DONE' ? 'PENDING' : 'DONE' })} disabled={busyId === task.id} title={task.status === 'DONE' ? 'Reabrir' : 'Completar'}
                        className={`flex h-5 w-5 items-center justify-center rounded-full border ${task.status === 'DONE' ? 'border-green-500 bg-green-500 text-white' : 'border-ink-300 hover:border-green-500'}`}>
                        {task.status === 'DONE' && <Check size={13} />}
                      </button>
                    </td>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-2">
                        <Icon size={15} className="shrink-0 text-ink-400" />
                        <button type="button" onClick={() => setModal({ task })} className={`truncate text-left font-medium hover:text-primary-700 ${task.status === 'DONE' ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{task.title}</button>
                        {task.source === 'agent' && <span title="Creada por IA"><Sparkles size={13} className="shrink-0 text-primary-500" /></span>}
                      </div>
                      {linked && <Link href={linked.href} className="ml-7 block truncate text-xs text-primary-700 hover:underline">{linked.name}</Link>}
                    </td>
                    <td className="py-2.5 pr-2"><Badge color={statusColor(PRIORITY_COLOR, task.priority)}>{PRIORITY[task.priority] ?? task.priority}</Badge></td>
                    <td className="py-2.5 pr-2">
                      <select value={task.status} onChange={(e) => void patch(task.id, { status: e.target.value })} disabled={busyId === task.id}
                        className={`rounded border border-ink-200 py-0.5 pl-1.5 pr-6 text-xs ${statusColor(TASK_STATUS_COLOR, task.status) === 'green' ? 'text-green-700' : ''}`}>
                        {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="hidden py-2.5 pr-2 md:table-cell">
                      <select value={task.ownerId ?? ''} onChange={(e) => void patch(task.id, { ownerId: e.target.value || null })} disabled={busyId === task.id}
                        className="max-w-[10rem] rounded border border-ink-200 py-0.5 pl-1.5 pr-6 text-xs text-ink-700">
                        <option value="">{t('taskBoard.unassigned')}</option>
                        {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td className="hidden py-2.5 pr-2 lg:table-cell"><span className={`text-xs ${overdue ? 'font-medium text-red-600' : 'text-ink-500'}`}>{dueLabel(task.dueAt) || '—'}</span></td>
                    <td className="py-2.5 pr-4 text-right">
                      <button type="button" onClick={() => setModal({ task })} className="rounded p-1 text-ink-400 hover:text-ink-800" aria-label="Editar"><Pencil size={14} /></button>
                      <button type="button" onClick={() => void remove(task)} className="rounded p-1 text-ink-400 hover:text-red-600" aria-label="Eliminar"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {BOARD_COLS.map((col) => {
            const items = filtered.filter((task) => task.status === col);
            return (
              <div key={col} className="rounded-lg border border-ink-100 bg-ink-50/40">
                <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-sm font-medium">
                  <span>{TASK_STATUS[col]}</span>
                  <span className="rounded-full bg-ink-200 px-1.5 text-[10px] text-ink-600">{items.length}</span>
                </div>
                <div className="max-h-[calc(100dvh-22rem)] space-y-2 overflow-y-auto p-2">
                  {items.map((task) => {
                    const Icon = TYPE_ICON[task.type] ?? CircleDot;
                    const linked = linkedOf(task);
                    const overdue = isOverdue(task);
                    return (
                      <div key={task.id} className="rounded-lg border border-ink-100 bg-white p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <button type="button" onClick={() => setModal({ task })} className="flex items-start gap-1.5 text-left">
                            <Icon size={14} className="mt-0.5 shrink-0 text-ink-400" />
                            <span className="text-sm font-medium text-ink-900 hover:text-primary-700">{task.title}</span>
                          </button>
                          {NEXT_STATUS[task.status] && (
                            <button type="button" onClick={() => void patch(task.id, { status: NEXT_STATUS[task.status] })} disabled={busyId === task.id} title={`Mover a ${TASK_STATUS[NEXT_STATUS[task.status]!]}`} className="shrink-0 rounded p-0.5 text-ink-400 hover:text-primary-700">→</button>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge color={statusColor(PRIORITY_COLOR, task.priority)}>{PRIORITY[task.priority] ?? task.priority}</Badge>
                          {task.dueAt && <span className={`text-[11px] ${overdue ? 'font-medium text-red-600' : 'text-ink-500'}`}>{dueLabel(task.dueAt)}</span>}
                          {task.ownerId && <span className="ml-auto"><Avatar name={nameOf(task.ownerId)} size="sm" /></span>}
                        </div>
                        {linked && <Link href={linked.href} className="mt-1 block truncate text-xs text-primary-700 hover:underline">{linked.name}</Link>}
                      </div>
                    );
                  })}
                  {items.length === 0 && <p className="p-2 text-center text-xs text-ink-400">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <TaskDrawer
          task={modal.task}
          assignees={assignees}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void load(); }}
        />
      )}
    </div>
  );
}
