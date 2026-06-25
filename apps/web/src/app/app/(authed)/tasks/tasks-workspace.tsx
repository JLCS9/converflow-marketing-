'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { Card, Field, Input, Select, Textarea, Badge, buttonClass } from '@/components/ui/primitives';
import { EntityPicker } from '@/components/ui/entity-picker';
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

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dueLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function isOverdue(t: Task): boolean {
  return !!t.dueAt && t.status !== 'DONE' && t.status !== 'CANCELLED' && new Date(t.dueAt) < new Date();
}
function linkedOf(t: Task): { href: string; name: string } | null {
  if (t.lead) return { href: `/app/leads/${t.lead.id}`, name: t.lead.name };
  if (t.client) return { href: `/app/clients/${t.client.id}`, name: t.client.name };
  if (t.opportunity) return { href: `/app/opportunities/${t.opportunity.id}`, name: t.opportunity.name };
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
  const session = useSession();
  const fb = useFeedback();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [scope, setScope] = useState<'mine' | 'team' | 'all'>('mine');
  const [quick, setQuick] = useState<'today' | 'overdue' | 'unassigned' | null>(null);
  const [statusF, setStatusF] = useState('');
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
  async function remove(t: Task) {
    const ok = await fb.confirm({ title: 'Eliminar tarea', description: t.title, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    try {
      await apiFetch(`/tasks/${t.id}`, { method: 'DELETE' });
      fb.toast.success('Tarea eliminada');
      await load();
    } catch {
      fb.toast.error('No se pudo eliminar');
    }
  }

  const startOfToday = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime(), []);
  const endOfToday = startOfToday + 86400000;

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (scope === 'mine' && t.ownerId !== session.userId) return false;
      if (scope === 'team' && !t.ownerId) return false;
      if (statusF && t.status !== statusF) return false;
      if (typeF && t.type !== typeF) return false;
      if (quick === 'overdue' && !isOverdue(t)) return false;
      if (quick === 'unassigned' && t.ownerId) return false;
      if (quick === 'today') {
        if (!t.dueAt) return false;
        const d = new Date(t.dueAt).getTime();
        if (d < startOfToday || d >= endOfToday) return false;
      }
      if (q.trim() && !t.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
  }, [tasks, scope, statusF, typeF, quick, q, session.userId, startOfToday, endOfToday]);

  const segBtn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'}`;
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs ${active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-100'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-ink-200 p-0.5">
            <button type="button" onClick={() => setView('list')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${view === 'list' ? 'bg-ink-100 text-ink-900' : 'text-ink-500'}`}><LayoutList size={14} /> Lista</button>
            <button type="button" onClick={() => setView('board')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${view === 'board' ? 'bg-ink-100 text-ink-900' : 'text-ink-500'}`}><Columns3 size={14} /> Tablero</button>
          </div>
          <button type="button" onClick={() => setModal({ task: null })} className={buttonClass('primary', 'flex items-center gap-1.5')}>
            <Plus size={16} /> Nueva tarea
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3"><div className="text-xs text-ink-500">Pendientes</div><div className="text-2xl font-semibold">{stats.pending}</div></Card>
        <Card className="p-3"><div className="text-xs text-ink-500">Vencidas</div><div className={`text-2xl font-semibold ${stats.overdue > 0 ? 'text-red-600' : ''}`}>{stats.overdue}</div></Card>
        <Card className="p-3"><div className="text-xs text-ink-500">Hechas (7 días)</div><div className="text-2xl font-semibold text-green-600">{stats.doneThisWeek}</div></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-ink-100 p-0.5">
          <button type="button" onClick={() => setScope('mine')} className={segBtn(scope === 'mine')}>Mías</button>
          <button type="button" onClick={() => setScope('team')} className={segBtn(scope === 'team')}>Equipo</button>
          <button type="button" onClick={() => setScope('all')} className={segBtn(scope === 'all')}>Todas</button>
        </div>
        <button type="button" onClick={() => setQuick(quick === 'today' ? null : 'today')} className={chip(quick === 'today')}>Hoy</button>
        <button type="button" onClick={() => setQuick(quick === 'overdue' ? null : 'overdue')} className={chip(quick === 'overdue')}>Vencidas</button>
        <button type="button" onClick={() => setQuick(quick === 'unassigned' ? null : 'unassigned')} className={chip(quick === 'unassigned')}>Sin asignar</button>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded border border-ink-200 px-2 py-1 text-xs">
          <option value="">Todos los estados</option>
          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="rounded border border-ink-200 px-2 py-1 text-xs">
          <option value="">Todos los tipos</option>
          {Object.entries(TASK_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="rounded border border-ink-200 px-2 py-1 text-xs" />
      </div>

      {filtered.length === 0 ? (
        <Card className="text-center text-sm text-ink-500">No hay tareas con estos filtros.</Card>
      ) : view === 'list' ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <tbody>
              {filtered.map((t) => {
                const Icon = TYPE_ICON[t.type] ?? CircleDot;
                const linked = linkedOf(t);
                const overdue = isOverdue(t);
                return (
                  <tr key={t.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/30">
                    <td className="py-2.5 pl-4 pr-2">
                      <button type="button" onClick={() => void patch(t.id, { status: t.status === 'DONE' ? 'PENDING' : 'DONE' })} disabled={busyId === t.id} title={t.status === 'DONE' ? 'Reabrir' : 'Completar'}
                        className={`flex h-5 w-5 items-center justify-center rounded-full border ${t.status === 'DONE' ? 'border-green-500 bg-green-500 text-white' : 'border-ink-300 hover:border-green-500'}`}>
                        {t.status === 'DONE' && <Check size={13} />}
                      </button>
                    </td>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-2">
                        <Icon size={15} className="shrink-0 text-ink-400" />
                        <button type="button" onClick={() => setModal({ task: t })} className={`truncate text-left font-medium hover:text-primary-700 ${t.status === 'DONE' ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{t.title}</button>
                        {t.source === 'agent' && <span title="Creada por IA"><Sparkles size={13} className="shrink-0 text-primary-500" /></span>}
                      </div>
                      {linked && <Link href={linked.href} className="ml-7 block truncate text-xs text-primary-700 hover:underline">{linked.name}</Link>}
                    </td>
                    <td className="py-2.5 pr-2"><Badge color={statusColor(PRIORITY_COLOR, t.priority)}>{PRIORITY[t.priority] ?? t.priority}</Badge></td>
                    <td className="py-2.5 pr-2">
                      <select value={t.status} onChange={(e) => void patch(t.id, { status: e.target.value })} disabled={busyId === t.id}
                        className={`rounded border border-ink-200 px-1.5 py-0.5 text-xs ${statusColor(TASK_STATUS_COLOR, t.status) === 'green' ? 'text-green-700' : ''}`}>
                        {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="hidden py-2.5 pr-2 md:table-cell">
                      <select value={t.ownerId ?? ''} onChange={(e) => void patch(t.id, { ownerId: e.target.value || null })} disabled={busyId === t.id}
                        className="max-w-[10rem] rounded border border-ink-200 px-1.5 py-0.5 text-xs text-ink-700">
                        <option value="">Sin asignar</option>
                        {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td className="hidden py-2.5 pr-2 lg:table-cell"><span className={`text-xs ${overdue ? 'font-medium text-red-600' : 'text-ink-500'}`}>{dueLabel(t.dueAt) || '—'}</span></td>
                    <td className="py-2.5 pr-4 text-right">
                      <button type="button" onClick={() => setModal({ task: t })} className="rounded p-1 text-ink-400 hover:text-ink-800" aria-label="Editar"><Pencil size={14} /></button>
                      <button type="button" onClick={() => void remove(t)} className="rounded p-1 text-ink-400 hover:text-red-600" aria-label="Eliminar"><Trash2 size={14} /></button>
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
            const items = filtered.filter((t) => t.status === col);
            return (
              <div key={col} className="rounded-lg border border-ink-100 bg-ink-50/40">
                <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-sm font-medium">
                  <span>{TASK_STATUS[col]}</span>
                  <span className="rounded-full bg-ink-200 px-1.5 text-[10px] text-ink-600">{items.length}</span>
                </div>
                <div className="max-h-[calc(100dvh-22rem)] space-y-2 overflow-y-auto p-2">
                  {items.map((t) => {
                    const Icon = TYPE_ICON[t.type] ?? CircleDot;
                    const linked = linkedOf(t);
                    const overdue = isOverdue(t);
                    return (
                      <div key={t.id} className="rounded-lg border border-ink-100 bg-white p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <button type="button" onClick={() => setModal({ task: t })} className="flex items-start gap-1.5 text-left">
                            <Icon size={14} className="mt-0.5 shrink-0 text-ink-400" />
                            <span className="text-sm font-medium text-ink-900 hover:text-primary-700">{t.title}</span>
                          </button>
                          {NEXT_STATUS[t.status] && (
                            <button type="button" onClick={() => void patch(t.id, { status: NEXT_STATUS[t.status] })} disabled={busyId === t.id} title={`Mover a ${TASK_STATUS[NEXT_STATUS[t.status]!]}`} className="shrink-0 rounded p-0.5 text-ink-400 hover:text-primary-700">→</button>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge color={statusColor(PRIORITY_COLOR, t.priority)}>{PRIORITY[t.priority] ?? t.priority}</Badge>
                          {t.dueAt && <span className={`text-[11px] ${overdue ? 'font-medium text-red-600' : 'text-ink-500'}`}>{dueLabel(t.dueAt)}</span>}
                          {t.ownerId && <span className="ml-auto"><Avatar name={nameOf(t.ownerId)} size="sm" /></span>}
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
        <TaskModal
          task={modal.task}
          assignees={assignees}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void load(); }}
        />
      )}
    </div>
  );
}

function TaskModal({
  task,
  assignees,
  onClose,
  onSaved,
}: {
  task: Task | null;
  assignees: Ref[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fb = useFeedback();
  const [saving, setSaving] = useState(false);
  const editing = !!task;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const dueAtStr = String(data.get('dueAt') ?? '').trim();
    const ownerId = String(data.get('ownerId') ?? '').trim();
    const leadId = String(data.get('leadId') ?? '').trim();
    const clientId = String(data.get('clientId') ?? '').trim();
    const opportunityId = String(data.get('opportunityId') ?? '').trim();
    const payload: Record<string, unknown> = {
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? '').trim() || undefined,
      type: String(data.get('type') ?? 'OTHER'),
      priority: String(data.get('priority') ?? 'MEDIUM'),
      status: String(data.get('status') ?? 'PENDING'),
      dueAt: dueAtStr ? new Date(dueAtStr).toISOString() : null,
      ownerId: ownerId || null,
      leadId: leadId || null,
      clientId: clientId || null,
      opportunityId: opportunityId || null,
    };
    if (!payload.title) {
      fb.toast.error('El título es obligatorio');
      return;
    }
    setSaving(true);
    (async () => {
      try {
        if (editing) await apiFetch(`/tasks/${task!.id}`, { method: 'PATCH', json: payload });
        else await apiFetch('/tasks', { method: 'POST', json: payload });
        fb.toast.success(editing ? 'Tarea actualizada' : 'Tarea creada');
        onSaved();
      } catch {
        fb.toast.error('No se pudo guardar la tarea');
        setSaving(false);
      }
    })();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-xl rounded-lg border border-ink-100 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h3 className="text-sm font-semibold">{editing ? 'Editar tarea' : 'Nueva tarea'}</h3>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700" aria-label="Cerrar">✕</button>
        </div>
        <form className="space-y-4 p-4" onSubmit={submit}>
          <Field label="Título" required>
            <Input name="title" defaultValue={task?.title ?? ''} required maxLength={200} autoFocus />
          </Field>
          <Field label="Descripción">
            <Textarea name="description" rows={3} defaultValue={task?.description ?? ''} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo">
              <Select name="type" defaultValue={task?.type ?? 'OTHER'}>
                {Object.entries(TASK_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Prioridad">
              <Select name="priority" defaultValue={task?.priority ?? 'MEDIUM'}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Estado">
              <Select name="status" defaultValue={task?.status ?? 'PENDING'}>
                {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Asignar a">
              <Select name="ownerId" defaultValue={task?.ownerId ?? ''}>
                <option value="">Sin asignar</option>
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Vence">
            <Input name="dueAt" type="datetime-local" defaultValue={toLocalInput(task?.dueAt ?? null)} />
          </Field>
          <div className="space-y-3 border-t border-ink-100 pt-3">
            <EntityPicker endpoint="/leads" name="leadId" label="Lead vinculado" defaultId={task?.lead?.id} defaultName={task?.lead?.name} placeholder="Buscar lead…" />
            <EntityPicker endpoint="/clients" name="clientId" label="Cliente vinculado" defaultId={task?.client?.id} defaultName={task?.client?.name} placeholder="Buscar cliente…" />
            <EntityPicker endpoint="/opportunities" name="opportunityId" label="Oportunidad vinculada" defaultId={task?.opportunity?.id} defaultName={task?.opportunity?.name} placeholder="Buscar oportunidad…" />
          </div>
          <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
            <button type="button" onClick={onClose} className={buttonClass('secondary')} disabled={saving}>Cancelar</button>
            <button type="submit" className={buttonClass('primary')} disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
