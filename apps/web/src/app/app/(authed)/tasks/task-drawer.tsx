'use client';

/**
 * Panel lateral de detalle/creación de tarea.
 *
 * Sustituye al modal estrecho anterior (un formulario plano). Jerarquía:
 * título editable inline, chips de estado y prioridad con color, vencimiento
 * con indicador de vencida/próxima, asignado con avatar, descripción, vínculos
 * y una línea de actividad. Sin librerías nuevas: primitives + Tailwind.
 */

import { useEffect, useState } from 'react';
import { X, CalendarClock, Link2, History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { useFeedback } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { Avatar } from '@/components/ui/inbox-kit';
import { EntityPicker } from '@/components/ui/entity-picker';
import { useLabelMaps } from '@/lib/use-labels';

export interface DrawerTask {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  dueAt: string | null;
  ownerId: string | null;
  source?: string;
  createdAt?: string;
  lead?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
  opportunity?: { id: string; name: string } | null;
}

interface Ref {
  id: string;
  name: string;
}

/** Chips de estado: color = significado, no decoración. */
const STATUS_CHIP: Record<string, { on: string; off: string }> = {
  PENDING: { on: 'bg-amber-500 text-white', off: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
  IN_PROGRESS: { on: 'bg-sky-600 text-white', off: 'bg-sky-50 text-sky-700 hover:bg-sky-100' },
  DONE: { on: 'bg-green-600 text-white', off: 'bg-green-50 text-green-700 hover:bg-green-100' },
  CANCELLED: { on: 'bg-ink-500 text-white', off: 'bg-ink-100 text-ink-500 hover:bg-ink-200' },
};

const PRIORITY_CHIP: Record<string, { on: string; off: string }> = {
  LOW: { on: 'bg-ink-500 text-white', off: 'bg-ink-100 text-ink-500 hover:bg-ink-200' },
  MEDIUM: { on: 'bg-sky-600 text-white', off: 'bg-sky-50 text-sky-700 hover:bg-sky-100' },
  HIGH: { on: 'bg-orange-500 text-white', off: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
  URGENT: { on: 'bg-red-600 text-white', off: 'bg-red-50 text-red-700 hover:bg-red-100' },
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Traductor mínimo que se pasa desde el componente (las funciones de módulo no
// pueden usar hooks).
type TFunc = (key: string, values?: Record<string, string | number>) => string;

function dueBadge(dueAt: string, status: string, t: TFunc): { text: string; cls: string } | null {
  if (status === 'DONE' || status === 'CANCELLED') return null;
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date(dueAt)) - start(new Date())) / 86400000);
  if (days < 0) return { text: days === -1 ? t('dueYesterday') : t('dueOverdueDays', { n: -days }), cls: 'bg-red-100 text-red-700' };
  if (days === 0) return { text: t('dueToday'), cls: 'bg-amber-100 text-amber-800' };
  if (days <= 3) return { text: days === 1 ? t('dueTomorrow') : t('dueInDays', { n: days }), cls: 'bg-amber-50 text-amber-700' };
  return null;
}

export function TaskDrawer({
  task,
  assignees,
  onClose,
  onSaved,
}: {
  /** null = crear una nueva. */
  task: DrawerTask | null;
  assignees: Ref[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const tf = useTranslations('crmForms');
  const { TASK_TYPE, TASK_STATUS, PRIORITY } = useLabelMaps();
  const t = useTranslations();
  const fb = useFeedback();
  const editing = !!task;

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState(task?.status ?? 'PENDING');
  const [priority, setPriority] = useState(task?.priority ?? 'MEDIUM');
  const [type, setType] = useState(task?.type ?? 'OTHER');
  const [dueAt, setDueAt] = useState(toLocalInput(task?.dueAt ?? null));
  const [ownerId, setOwnerId] = useState(task?.ownerId ?? '');
  const [saving, setSaving] = useState(false);

  // Cerrar con Escape: un drawer sin esa salida se siente como una trampa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const owner = assignees.find((a) => a.id === ownerId) ?? null;
  const due = dueAt ? dueBadge(new Date(dueAt).toISOString(), status, tf) : null;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) {
      fb.toast.error(t('toasts.titleRequired'));
      return;
    }
    const data = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      priority,
      status,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      ownerId: ownerId || null,
      leadId: String(data.get('leadId') ?? '').trim() || null,
      clientId: String(data.get('clientId') ?? '').trim() || null,
      opportunityId: String(data.get('opportunityId') ?? '').trim() || null,
    };
    setSaving(true);
    (async () => {
      try {
        if (editing) await apiFetch(`/tasks/${task!.id}`, { method: 'PATCH', json: payload });
        else await apiFetch('/tasks', { method: 'POST', json: payload });
        fb.toast.success(editing ? tf('taskUpdated') : tf('taskCreated'));
        onSaved();
      } catch {
        fb.toast.error(t('toasts.taskSaveError'));
        setSaving(false);
      }
    })();
  }

  const chipRow = (
    entries: [string, string][],
    current: string,
    setCurrent: (v: string) => void,
    palette: Record<string, { on: string; off: string }>,
  ) => (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setCurrent(key)}
          aria-pressed={current === key}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            current === key ? palette[key]?.on ?? 'bg-ink-900 text-white' : palette[key]?.off ?? 'bg-ink-100 text-ink-600'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={editing ? t('taskBoard.editTask') : t('taskBoard.newTask')}
        className="fixed inset-y-0 right-0 flex w-full max-w-[540px] flex-col border-l border-ink-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form className="flex h-full flex-col" onSubmit={submit}>
          {/* Cabecera: título editable inline, no un campo de formulario. */}
          <div className="flex items-start gap-2 border-b border-ink-100 px-5 pb-3 pt-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('taskBoard.formTitle')}
              maxLength={200}
              autoFocus={!editing}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-lg font-semibold text-ink-900 placeholder:font-normal placeholder:text-ink-300 focus:outline-none focus:ring-0"
            />
            <button type="button" onClick={onClose} aria-label={tf('close')} className="mt-1 shrink-0 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {/* Estado y prioridad como chips, no selects. */}
            <div className="space-y-2.5">
              {chipRow(Object.entries(TASK_STATUS), status, setStatus, STATUS_CHIP)}
              {chipRow(Object.entries(PRIORITY), priority, setPriority, PRIORITY_CHIP)}
            </div>

            {/* Vencimiento + asignado + tipo. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tf('dueAt')}>
                <div className="space-y-1">
                  <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                  {due && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${due.cls}`}>
                      <CalendarClock size={11} /> {due.text}
                    </span>
                  )}
                </div>
              </Field>
              <Field label={t('taskBoard.assignTo')}>
                <div className="space-y-1">
                  <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                    <option value="">{t('taskBoard.unassigned')}</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </Select>
                  {owner && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
                      <Avatar name={owner.name} size="sm" /> {owner.name}
                    </span>
                  )}
                </div>
              </Field>
            </div>
            <Field label={tf('type')}>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(TASK_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </Field>

            <Field label={t('taskBoard.formDescription')}>
              <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>

            {/* Vínculos con el CRM. */}
            <div className="space-y-3 rounded-lg border border-ink-100 bg-ink-100/20 p-3">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600">
                <Link2 size={13} /> {tf('linkedTo')}
              </p>
              <EntityPicker endpoint="/leads" name="leadId" label={tf('lead')} defaultId={task?.lead?.id} defaultName={task?.lead?.name} placeholder={tf('searchLead')} />
              <EntityPicker endpoint="/clients" name="clientId" label={tf('client')} defaultId={task?.client?.id} defaultName={task?.client?.name} placeholder={tf('searchClient')} />
              <EntityPicker endpoint="/opportunities" name="opportunityId" label={tf('opportunity')} defaultId={task?.opportunity?.id} defaultName={task?.opportunity?.name} placeholder={tf('searchOpp')} />
            </div>

            {/* Actividad: lo que se sabe de la vida de la tarea. */}
            {editing && (
              <div className="space-y-1 border-t border-ink-100 pt-3 text-[11px] text-ink-500">
                <p className="inline-flex items-center gap-1.5 font-medium text-ink-600">
                  <History size={12} /> {tf('activity')}
                </p>
                {task?.createdAt && (
                  <p>
                    {tf('createdOn', {
                      date: new Date(task.createdAt).toLocaleString('es-ES', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }),
                    })}
                    {task.source && task.source !== 'manual' ? ` · ${tf('origin', { source: task.source })}` : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">
            <button type="button" onClick={onClose} className={buttonClass('secondary')} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={buttonClass('primary')} disabled={saving}>
              {saving ? t('common.saving') : editing ? t('common.save') : t('taskBoard.newTask')}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
