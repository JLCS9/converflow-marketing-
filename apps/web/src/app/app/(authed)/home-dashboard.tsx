'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  MessageCircle,
  Clock,
  Target,
  Flame,
  ListChecks,
  Bell,
  FileText,
  Sparkles,
  CalendarCheck,
  Star,
  UserCog,
  Mail,
  SlidersHorizontal,
  GripVertical,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/session-context';
import { useFeedback } from '@/components/ui/feedback';
import { Card, StatCard, buttonClass } from '@/components/ui/primitives';
import { OnboardingChecklist, type OnboardingStep } from '@/components/ui/onboarding-checklist';
import type { PermissionModule } from '@converflow/shared';

// ---- data shapes (fetched server-side, passed in) ----

export interface Overview {
  leads: { total: number; byStatus: { status: string; count: number }[]; bySource: { source: string; count: number }[]; conversionRate: number };
  opportunities: { openValue: number; wonValue: number };
  tasks: { pending: number; overdue: number; done: number };
  clients: { total: number; active: number };
}
interface Delta { current: number; previous: number; pct: number | null }
export interface Series {
  days: string[];
  series: { leadsCreated: number[]; conversions: number[]; wonCount: number[]; wonValue: number[]; inboundMessages: number[] };
  deltas: { leadsCreated: Delta; conversions: Delta; wonValue: Delta; inboundMessages: Delta };
  aiWeek: { attended: number; suggestions: number; leadsScored: number; meetings: number; escalations: number; handled: number; autoResolvedPct: number | null };
}
export interface AlertItem { id: string; type: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; title: string; description: string | null; resourceType: string; resourceId: string }
export interface ConvRow { id: string; contactName: string | null; contactPhone: string | null; contactJid: string; lastMessagePreview: string | null; assignedUserId: string | null }
export interface TaskPreview { id: string; title: string; dueAt: string | null; ownerId: string | null }
export interface DocPreview { id: string; name: string; sizeBytes: number }

export interface DashboardData {
  overview: Overview;
  series: Series;
  alerts: AlertItem[];
  convs: ConvRow[];
  tasks: TaskPreview[];
  docs: DocPreview[];
  mailUnread: number;
}

// ---- widget registry ----

type Size = 'sm' | 'md' | 'lg';
interface WidgetItem { id: string; size: Size }
interface WidgetDef { id: string; title: string; perm?: PermissionModule; defaultOn: boolean; size: Size }

const WIDGETS: WidgetDef[] = [
  { id: 'alerts', title: 'Alertas', defaultOn: true, size: 'md' },
  { id: 'my-tasks', title: 'Mis tareas', perm: 'crm', defaultOn: true, size: 'md' },
  { id: 'my-conversations', title: 'Mis conversaciones', perm: 'conversations', defaultOn: true, size: 'md' },
  { id: 'unread-mail', title: 'Correo sin leer', perm: 'conversations', defaultOn: true, size: 'sm' },
  { id: 'kpis', title: 'Indicadores (KPIs)', perm: 'crm', defaultOn: true, size: 'lg' },
  { id: 'queue', title: 'Tu cola de hoy', defaultOn: false, size: 'md' },
  { id: 'ai-week', title: 'Tu IA esta semana', perm: 'agents', defaultOn: true, size: 'lg' },
  { id: 'funnel', title: 'Embudo de leads', perm: 'crm', defaultOn: true, size: 'md' },
  { id: 'sources', title: 'Leads por fuente', perm: 'crm', defaultOn: false, size: 'sm' },
  { id: 'recent-docs', title: 'Documentos recientes', perm: 'documents', defaultOn: false, size: 'sm' },
];

// Literal span classes so Tailwind JIT keeps them. Grid base: md:2 cols, xl:3 cols.
const SIZE_SPAN: Record<Size, string> = {
  sm: '',
  md: 'md:col-span-2 xl:col-span-2',
  lg: 'md:col-span-2 xl:col-span-3',
};
const NEXT_SIZE: Record<Size, Size> = { sm: 'md', md: 'lg', lg: 'sm' };

// ---- helpers ----

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const leadStatusLabel: Record<string, string> = { NEW: 'Nuevo', CONTACTED: 'Contactado', QUALIFIED: 'Cualificado', CONVERTED: 'Convertido', LOST: 'Perdido' };
const leadStatusColor: Record<string, string> = { NEW: 'bg-ink-300', CONTACTED: 'bg-blue-400', QUALIFIED: 'bg-amber-400', CONVERTED: 'bg-green-500', LOST: 'bg-red-400' };
const alertIcon: Record<string, LucideIcon> = { LEAD_STALE: Clock, OPPORTUNITY_DUE: Target, TASK_OVERDUE: ListChecks, HIGH_SCORE_LEAD: Flame };
const toneChip: Record<string, string> = { blue: 'bg-blue-100 text-blue-800', red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-800', green: 'bg-green-100 text-green-800', gray: 'bg-ink-100 text-ink-500' };

function severityTone(s: AlertItem['severity']): string {
  return s === 'CRITICAL' ? 'red' : s === 'WARNING' ? 'amber' : 'blue';
}
function resourceHref(a: AlertItem): string {
  if (a.resourceType === 'lead') return `/app/leads/${a.resourceId}`;
  if (a.resourceType === 'opportunity') return `/app/opportunities/${a.resourceId}`;
  return '/app/tasks';
}
function greeting(): string {
  const hour = Number(new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }));
  if (hour < 12) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">{children}</h3>
      {right}
    </div>
  );
}
function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-700">{label}</span>
        <span className="font-mono text-xs text-ink-500">{value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function HomeDashboard({
  data,
  steps,
  initialWidgets,
}: {
  data: DashboardData;
  steps: OnboardingStep[];
  initialWidgets: { id: string; size?: string }[] | null;
}) {
  const session = useSession();
  const fb = useFeedback();
  const can = (p?: PermissionModule) => !p || session.role === 'OWNER' || session.permissions.includes(p);
  const available = useMemo(() => WIDGETS.filter((w) => can(w.perm)), [session.permissions, session.role]);
  const availableIds = available.map((w) => w.id);

  const defaults: WidgetItem[] = available.filter((w) => w.defaultOn).map((w) => ({ id: w.id, size: w.size }));
  const coerceSize = (s: string | undefined, fallback: Size): Size =>
    s === 'sm' || s === 'md' || s === 'lg' ? s : fallback;
  const start: WidgetItem[] =
    initialWidgets && initialWidgets.length
      ? initialWidgets
          .filter((w) => availableIds.includes(w.id))
          .map((w) => ({ id: w.id, size: coerceSize(w.size, WIDGETS.find((d) => d.id === w.id)?.size ?? 'md') }))
      : defaults;

  const [items, setItems] = useState<WidgetItem[]>(start);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<WidgetItem[]>(start);
  const [saving, setSaving] = useState(false);
  const dragId = useRef<string | null>(null);

  const defOf = (id: string) => WIDGETS.find((w) => w.id === id);
  const hidden = available.filter((w) => !items.some((it) => it.id === w.id));

  function addWidget(id: string) {
    const d = defOf(id);
    if (d) setItems((arr) => [...arr, { id, size: d.size }]);
  }
  function removeWidget(id: string) {
    setItems((arr) => arr.filter((it) => it.id !== id));
  }
  function cycleSize(id: string) {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, size: NEXT_SIZE[it.size] } : it)));
  }
  function onDrop(targetId: string) {
    const from = items.findIndex((i) => i.id === dragId.current);
    const to = items.findIndex((i) => i.id === targetId);
    dragId.current = null;
    if (from < 0 || to < 0 || from === to) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m!);
    setItems(next);
  }
  function startEdit() {
    setSnapshot(items);
    setEditing(true);
  }
  function cancelEdit() {
    setItems(snapshot);
    setEditing(false);
  }
  async function save() {
    setSaving(true);
    try {
      await apiFetch('/me/dashboard', { method: 'PATCH', json: { widgets: items } });
      setSnapshot(items);
      setEditing(false);
      fb.toast.success('Panel guardado');
    } catch {
      fb.toast.error('No se pudo guardar el panel');
    } finally {
      setSaving(false);
    }
  }

  const myConvs = data.convs.filter((c) => c.assignedUserId === session.userId);
  const unassignedConvs = data.convs.filter((c) => !c.assignedUserId);
  const convShown = [...myConvs, ...unassignedConvs].slice(0, 6);
  const myTasks = data.tasks.filter((t) => t.ownerId === session.userId);

  function renderWidget(id: string): React.ReactNode {
    const { overview, series, alerts, docs, mailUnread } = data;
    switch (id) {
      case 'alerts':
        return (
          <Card className="h-full">
            <CardTitle right={<Link href="/app/alerts" className="text-xs text-primary-700 hover:underline">Ver todas →</Link>}>
              <Bell size={15} strokeWidth={1.75} className="text-red-500" /> Alertas
            </CardTitle>
            {alerts.length === 0 ? (
              <p className="text-sm text-ink-500">Sin alertas. Todo en orden. 🎉</p>
            ) : (
              <div className="space-y-1.5">
                {alerts.slice(0, 6).map((a) => (
                  <Link key={a.id} href={resourceHref(a)} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-ink-100/50">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneChip[severityTone(a.severity)]}`}>
                      {(() => { const I = alertIcon[a.type] ?? Bell; return <I size={16} strokeWidth={1.75} />; })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">{a.title}</div>
                      {a.description && <div className="truncate text-xs text-ink-500">{a.description}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        );
      case 'my-tasks':
        return (
          <Card className="h-full">
            <CardTitle right={<Link href="/app/tasks" className="text-xs text-primary-700 hover:underline">Ver todas →</Link>}>
              <ListChecks size={15} strokeWidth={1.75} className="text-primary-600" /> Mis tareas
            </CardTitle>
            {myTasks.length === 0 ? (
              <p className="text-sm text-ink-500">No tienes tareas pendientes asignadas. 🎉</p>
            ) : (
              <ul className="space-y-1.5">
                {myTasks.slice(0, 8).map((t) => {
                  const overdue = t.dueAt && new Date(t.dueAt) < new Date();
                  return (
                    <li key={t.id} className="flex items-baseline justify-between gap-2 text-sm">
                      <Link href="/app/tasks" className="min-w-0 flex-1 truncate text-ink-900 hover:text-primary-700" title={t.title}>{t.title}</Link>
                      <span className={`shrink-0 font-mono text-[11px] ${overdue ? 'text-red-600' : 'text-ink-500'}`}>
                        {t.dueAt ? new Date(t.dueAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      case 'my-conversations':
        return (
          <Card className="h-full">
            <CardTitle right={<Link href="/app/conversations" className="text-xs text-primary-700 hover:underline">Bandeja →</Link>}>
              <MessageCircle size={15} strokeWidth={1.75} className="text-blue-500" /> Mis conversaciones
            </CardTitle>
            {convShown.length === 0 ? (
              <p className="text-sm text-ink-500">Sin conversaciones pendientes. 🎉</p>
            ) : (
              <ul className="space-y-1">
                {convShown.map((c) => (
                  <li key={c.id}>
                    <Link href="/app/conversations" className="block rounded p-1.5 hover:bg-ink-100/50">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink-900">{c.contactName || c.contactPhone || 'Contacto'}</span>
                        {c.assignedUserId === session.userId && <span className="shrink-0 rounded bg-primary-100 px-1 text-[9px] font-medium text-primary-700">Mía</span>}
                      </div>
                      {c.lastMessagePreview && <div className="truncate text-xs text-ink-500">{c.lastMessagePreview}</div>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      case 'unread-mail':
        return (
          <Link href="/app/mail" className="flex h-full items-center gap-3 rounded-lg border border-ink-100 bg-white p-4 hover:bg-ink-100/40">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700"><Mail size={20} strokeWidth={1.75} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-semibold tracking-tight">{mailUnread}</div>
              <div className="text-xs text-ink-500">correos sin leer</div>
            </div>
          </Link>
        );
      case 'kpis':
        return (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Leads" value={overview.leads.total} hint={`${series.deltas.leadsCreated.current} nuevos · ${overview.clients.total} clientes`} spark={series.series.leadsCreated} delta={series.deltas.leadsCreated.pct} />
            <StatCard label="Conversión" value={`${Math.round(overview.leads.conversionRate * 100)}%`} hint={`${series.deltas.conversions.current} convertidos`} spark={series.series.conversions} sparkStroke="stroke-green-500" delta={series.deltas.conversions.pct} />
            <StatCard label="Ganado" value={eur.format(series.deltas.wonValue.current)} hint={`${eur.format(overview.opportunities.openValue)} en pipeline`} spark={series.series.wonValue} sparkStroke="stroke-amber-500" delta={series.deltas.wonValue.pct} />
            <StatCard label="Tareas vencidas" value={overview.tasks.overdue} hint={`${overview.tasks.pending} pendientes`} />
          </div>
        );
      case 'queue': {
        const queue = [
          ...data.convs.slice(0, 4).map((c) => ({ Icon: MessageCircle, tone: 'blue', title: `${c.contactName || c.contactPhone || 'Contacto'} · sin responder`, meta: c.lastMessagePreview, href: '/app/conversations', action: 'Responder' })),
          ...alerts.slice(0, 4).map((a) => ({ Icon: alertIcon[a.type] ?? Bell, tone: severityTone(a.severity), title: a.title, meta: a.description, href: resourceHref(a), action: 'Ver' })),
        ].slice(0, 6);
        return (
          <Card className="h-full">
            <CardTitle>Tu cola de hoy</CardTitle>
            {queue.length === 0 ? (
              <p className="text-center text-sm text-ink-500">🎉 Todo al día.</p>
            ) : (
              <div className="space-y-2">
                {queue.map((q, i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-lg border border-ink-100 p-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneChip[q.tone] ?? toneChip.gray}`}><q.Icon size={16} strokeWidth={1.75} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">{q.title}</div>
                      {q.meta && <div className="truncate text-xs text-ink-500">{q.meta}</div>}
                    </div>
                    <Link href={q.href} className={buttonClass('secondary', 'shrink-0 text-xs')}>{q.action}</Link>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      }
      case 'ai-week': {
        const ai = series.aiWeek;
        if (ai.handled === 0 && ai.leadsScored === 0 && ai.meetings === 0) {
          return (
            <Card className="h-full">
              <CardTitle><Sparkles size={15} strokeWidth={1.75} className="text-primary-600" /> Tu IA esta semana</CardTitle>
              <p className="text-sm text-ink-500">Tu IA aún no ha actuado esta semana.</p>
            </Card>
          );
        }
        const cards = [
          { Icon: MessageCircle, label: 'Atendidas', value: ai.attended, hint: ai.autoResolvedPct !== null ? `${Math.round(ai.autoResolvedPct * 100)}% sin intervención` : `${ai.suggestions} sugerencias` },
          { Icon: Star, label: 'Leads puntuados', value: ai.leadsScored, hint: 'Lead scoring' },
          { Icon: CalendarCheck, label: 'Reuniones', value: ai.meetings, hint: 'Agendadas' },
          { Icon: UserCog, label: 'Escaladas', value: ai.escalations, hint: 'A humano' },
        ];
        return (
          <Card className="h-full">
            <CardTitle right={<span className="font-mono text-xs text-ink-500">7 días</span>}>
              <Sparkles size={15} strokeWidth={1.75} className="text-primary-600" /> Tu IA esta semana
            </CardTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((t) => (
                <div key={t.label} className="rounded-lg border border-ink-100 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-500"><t.Icon size={13} strokeWidth={1.75} /> {t.label}</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight">{t.value}</div>
                  <div className="text-xs text-ink-500">{t.hint}</div>
                </div>
              ))}
            </div>
          </Card>
        );
      }
      case 'funnel': {
        const max = Math.max(1, ...overview.leads.byStatus.map((s) => s.count));
        return (
          <Card className="h-full">
            <CardTitle>Embudo de leads</CardTitle>
            <div className="space-y-3">
              {overview.leads.byStatus.map((s) => (
                <Bar key={s.status} label={leadStatusLabel[s.status] ?? s.status} value={s.count} max={max} color={leadStatusColor[s.status] ?? 'bg-ink-300'} />
              ))}
            </div>
          </Card>
        );
      }
      case 'sources': {
        const max = Math.max(1, ...overview.leads.bySource.map((s) => s.count));
        return (
          <Card className="h-full">
            <CardTitle>Leads por fuente</CardTitle>
            <div className="space-y-3">
              {overview.leads.bySource.length === 0 ? (
                <p className="text-sm text-ink-500">Sin datos de fuente.</p>
              ) : (
                overview.leads.bySource.map((s) => <Bar key={s.source} label={s.source} value={s.count} max={max} color="bg-primary-500" />)
              )}
            </div>
          </Card>
        );
      }
      case 'recent-docs':
        return (
          <Card className="h-full">
            <CardTitle right={<Link href="/app/documents" className="text-xs text-primary-700 hover:underline">Ver →</Link>}>
              <FileText size={15} strokeWidth={1.75} className="text-ink-500" /> Documentos
            </CardTitle>
            {docs.length === 0 ? (
              <p className="text-sm text-ink-500">Sin documentos.</p>
            ) : (
              <ul className="space-y-1.5">
                {docs.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <Link href="/app/documents" className="min-w-0 flex-1 truncate text-ink-900 hover:text-primary-700" title={d.name}>{d.name}</Link>
                    <span className="shrink-0 font-mono text-[11px] text-ink-500">{formatBytes(d.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting()} 👋</h1>
          <p className="mt-1 text-sm capitalize text-ink-500">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editing && (
            <button type="button" onClick={() => void save()} disabled={saving} className={buttonClass('primary', 'text-sm')}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
          <button type="button" onClick={editing ? cancelEdit : startEdit} className={buttonClass('ghost', 'flex items-center gap-1.5 text-sm')}>
            <SlidersHorizontal size={14} /> {editing ? 'Cancelar' : 'Editar panel'}
          </button>
        </div>
      </header>

      <OnboardingChecklist steps={steps} />

      {editing && (
        <Card className="bg-ink-50/40">
          <p className="mb-2 text-xs text-ink-500">Arrastra las tarjetas para reordenarlas · usa <strong>S/M/L</strong> para el tamaño · la ✕ las oculta.</p>
          {hidden.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-ink-500">Añadir:</span>
              {hidden.map((w) => (
                <button key={w.id} type="button" onClick={() => addWidget(w.id)} className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2 py-0.5 text-xs hover:bg-white">
                  <Plus size={11} /> {w.title}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="text-center text-sm text-ink-500">
          No hay tarjetas activas. Pulsa <strong>Editar panel</strong> para añadir alguna.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.id}
              className={SIZE_SPAN[it.size]}
              draggable={editing}
              onDragStart={() => { dragId.current = it.id; }}
              onDragOver={(e) => { if (editing) e.preventDefault(); }}
              onDrop={() => onDrop(it.id)}
            >
              {editing ? (
                <div className={`rounded-lg border-2 border-dashed border-primary-200 ${dragId.current === it.id ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-2 rounded-t-lg bg-primary-50 px-2 py-1 text-xs text-ink-600">
                    <GripVertical size={14} className="cursor-move text-ink-400" />
                    <span className="flex-1 font-medium">{defOf(it.id)?.title ?? it.id}</span>
                    <button type="button" onClick={() => cycleSize(it.id)} className="rounded border border-ink-200 bg-white px-1.5 font-mono hover:bg-ink-100" title="Tamaño">
                      {it.size.toUpperCase()}
                    </button>
                    <button type="button" onClick={() => removeWidget(it.id)} className="rounded p-0.5 text-ink-400 hover:text-red-600" aria-label="Ocultar"><X size={14} /></button>
                  </div>
                  <div className="pointer-events-none p-2 opacity-90">{renderWidget(it.id)}</div>
                </div>
              ) : (
                renderWidget(it.id)
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
