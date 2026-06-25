'use client';

import { useMemo, useState } from 'react';
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
  ArrowUp,
  ArrowDown,
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
  leads: {
    total: number;
    byStatus: { status: string; count: number }[];
    bySource: { source: string; count: number }[];
    conversionRate: number;
  };
  opportunities: { openValue: number; wonValue: number };
  tasks: { pending: number; overdue: number; done: number };
  clients: { total: number; active: number };
}
interface Delta {
  current: number;
  previous: number;
  pct: number | null;
}
export interface Series {
  days: string[];
  series: {
    leadsCreated: number[];
    conversions: number[];
    wonCount: number[];
    wonValue: number[];
    inboundMessages: number[];
  };
  deltas: {
    leadsCreated: Delta;
    conversions: Delta;
    wonValue: Delta;
    inboundMessages: Delta;
  };
  aiWeek: {
    attended: number;
    suggestions: number;
    leadsScored: number;
    meetings: number;
    escalations: number;
    handled: number;
    autoResolvedPct: number | null;
  };
}
export interface AlertItem {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string | null;
  resourceType: string;
  resourceId: string;
}
export interface ConvRow {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  contactJid: string;
  lastMessagePreview: string | null;
  assignedUserId: string | null;
}
export interface TaskPreview {
  id: string;
  title: string;
  dueAt: string | null;
  ownerId: string | null;
}
export interface DocPreview {
  id: string;
  name: string;
  sizeBytes: number;
}

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

interface WidgetDef {
  id: string;
  title: string;
  perm?: PermissionModule;
  defaultOn: boolean;
}
const WIDGETS: WidgetDef[] = [
  { id: 'alerts', title: 'Alertas', defaultOn: true },
  { id: 'my-tasks', title: 'Mis tareas', perm: 'crm', defaultOn: true },
  { id: 'my-conversations', title: 'Mis conversaciones', perm: 'conversations', defaultOn: true },
  { id: 'unread-mail', title: 'Correo sin leer', perm: 'conversations', defaultOn: true },
  { id: 'kpis', title: 'Indicadores (KPIs)', perm: 'crm', defaultOn: true },
  { id: 'queue', title: 'Tu cola de hoy', defaultOn: false },
  { id: 'ai-week', title: 'Tu IA esta semana', perm: 'agents', defaultOn: true },
  { id: 'funnel', title: 'Embudo de leads', perm: 'crm', defaultOn: true },
  { id: 'sources', title: 'Leads por fuente', perm: 'crm', defaultOn: false },
  { id: 'recent-docs', title: 'Documentos recientes', perm: 'documents', defaultOn: false },
];

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

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-base font-semibold">{children}</h2>
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
  initialWidgets: string[] | null;
}) {
  const session = useSession();
  const fb = useFeedback();
  const can = (p?: PermissionModule) => !p || session.role === 'OWNER' || session.permissions.includes(p);
  const available = useMemo(() => WIDGETS.filter((w) => can(w.perm)), [session.permissions, session.role]);
  const availableIds = available.map((w) => w.id);

  const defaultOrder = available.filter((w) => w.defaultOn).map((w) => w.id);
  const startOrder =
    initialWidgets && initialWidgets.length
      ? initialWidgets.filter((id) => availableIds.includes(id))
      : defaultOrder;

  const [order, setOrder] = useState<string[]>(startOrder);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string[]>(startOrder);
  const [saving, setSaving] = useState(false);

  const defOf = (id: string) => WIDGETS.find((w) => w.id === id);
  const enabledDefs = order.map(defOf).filter((w): w is WidgetDef => !!w);
  const disabledDefs = available.filter((w) => !order.includes(w.id));

  function toggle(id: string) {
    setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }
  function move(id: string, dir: -1 | 1) {
    setOrder((o) => {
      const i = o.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }
  function startEdit() {
    setSnapshot(order);
    setEditing(true);
  }
  function cancelEdit() {
    setOrder(snapshot);
    setEditing(false);
  }
  async function save() {
    setSaving(true);
    try {
      await apiFetch('/me/dashboard', { method: 'PATCH', json: { widgets: order } });
      setSnapshot(order);
      setEditing(false);
      fb.toast.success('Panel guardado');
    } catch {
      fb.toast.error('No se pudo guardar el panel');
    } finally {
      setSaving(false);
    }
  }

  const myConvs = data.convs.filter((c) => c.assignedUserId === session.userId);
  const myTasks = data.tasks.filter((t) => t.ownerId === session.userId);

  function renderWidget(id: string): React.ReactNode {
    const { overview, series, alerts, docs, mailUnread } = data;
    switch (id) {
      case 'alerts':
        return (
          <section key={id}>
            <SectionTitle right={<Link href="/app/alerts" className="text-xs text-primary-700 hover:underline">Ver todas →</Link>}>
              <span className="flex items-center gap-2"><Bell size={16} strokeWidth={1.75} className="text-red-500" /> Alertas</span>
            </SectionTitle>
            {alerts.length === 0 ? (
              <Card className="text-center text-sm text-ink-500">Sin alertas. Todo en orden. 🎉</Card>
            ) : (
              <div className="space-y-2">
                {alerts.slice(0, 6).map((a) => (
                  <Link key={a.id} href={resourceHref(a)} className="flex items-center gap-3 rounded-lg border border-ink-100 bg-white p-3 hover:bg-ink-100/40">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneChip[severityTone(a.severity)]}`}>
                      {(() => { const I = alertIcon[a.type] ?? Bell; return <I size={18} strokeWidth={1.75} />; })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">{a.title}</div>
                      {a.description && <div className="truncate text-xs text-ink-500">{a.description}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      case 'my-tasks':
        return (
          <section key={id}>
            <SectionTitle right={<Link href="/app/tasks" className="text-xs text-primary-700 hover:underline">Ver todas →</Link>}>
              <span className="flex items-center gap-2"><ListChecks size={16} strokeWidth={1.75} className="text-primary-600" /> Mis tareas</span>
            </SectionTitle>
            <Card>
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
          </section>
        );
      case 'my-conversations':
        return (
          <section key={id}>
            <SectionTitle right={<Link href="/app/conversations" className="text-xs text-primary-700 hover:underline">Ir a la bandeja →</Link>}>
              <span className="flex items-center gap-2"><MessageCircle size={16} strokeWidth={1.75} className="text-blue-500" /> Mis conversaciones</span>
            </SectionTitle>
            <Card>
              {myConvs.length === 0 ? (
                <p className="text-sm text-ink-500">No tienes conversaciones asignadas pendientes.</p>
              ) : (
                <ul className="space-y-2">
                  {myConvs.slice(0, 6).map((c) => (
                    <li key={c.id} className="min-w-0">
                      <Link href="/app/conversations" className="block rounded p-1.5 hover:bg-ink-100/50">
                        <div className="truncate text-sm font-medium text-ink-900">{c.contactName || c.contactPhone || 'Contacto'}</div>
                        {c.lastMessagePreview && <div className="truncate text-xs text-ink-500">{c.lastMessagePreview}</div>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        );
      case 'unread-mail':
        return (
          <section key={id}>
            <Link href="/app/mail" className="flex items-center gap-3 rounded-lg border border-ink-100 bg-white p-4 hover:bg-ink-100/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700"><Mail size={20} strokeWidth={1.75} /></span>
              <div className="flex-1">
                <div className="text-2xl font-semibold tracking-tight">{mailUnread}</div>
                <div className="text-xs text-ink-500">correos sin leer en tus buzones</div>
              </div>
              <span className="text-xs text-primary-700">Abrir →</span>
            </Link>
          </section>
        );
      case 'kpis':
        return (
          <section key={id} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Leads" value={overview.leads.total} hint={`${series.deltas.leadsCreated.current} nuevos esta semana · ${overview.clients.total} clientes`} spark={series.series.leadsCreated} delta={series.deltas.leadsCreated.pct} />
            <StatCard label="Conversión" value={`${Math.round(overview.leads.conversionRate * 100)}%`} hint={`${series.deltas.conversions.current} convertidos esta semana`} spark={series.series.conversions} sparkStroke="stroke-green-500" delta={series.deltas.conversions.pct} />
            <StatCard label="Ganado" value={eur.format(series.deltas.wonValue.current)} hint={`${eur.format(overview.opportunities.openValue)} en pipeline abierto · 7 días`} spark={series.series.wonValue} sparkStroke="stroke-amber-500" delta={series.deltas.wonValue.pct} />
            <StatCard label="Tareas vencidas" value={overview.tasks.overdue} hint={`${overview.tasks.pending} pendientes`} />
          </section>
        );
      case 'queue': {
        const queue = [
          ...data.convs.slice(0, 4).map((c) => ({ Icon: MessageCircle, tone: 'blue', title: `${c.contactName || c.contactPhone || 'Contacto'} · sin responder`, meta: c.lastMessagePreview, href: '/app/conversations', action: 'Responder' })),
          ...alerts.slice(0, 4).map((a) => ({ Icon: alertIcon[a.type] ?? Bell, tone: severityTone(a.severity), title: a.title, meta: a.description, href: resourceHref(a), action: 'Ver' })),
        ].slice(0, 6);
        return (
          <section key={id}>
            <SectionTitle>Tu cola de hoy</SectionTitle>
            {queue.length === 0 ? (
              <Card className="text-center text-sm text-ink-500">🎉 Todo al día.</Card>
            ) : (
              <div className="space-y-2">
                {queue.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-ink-100 bg-white p-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneChip[q.tone] ?? toneChip.gray}`}><q.Icon size={18} strokeWidth={1.75} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">{q.title}</div>
                      {q.meta && <div className="truncate text-xs text-ink-500">{q.meta}</div>}
                    </div>
                    <Link href={q.href} className={buttonClass('secondary', 'shrink-0')}>{q.action}</Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      }
      case 'ai-week': {
        const ai = series.aiWeek;
        if (ai.handled === 0 && ai.leadsScored === 0 && ai.meetings === 0) {
          return (
            <section key={id}>
              <SectionTitle><span className="flex items-center gap-2"><Sparkles size={16} strokeWidth={1.75} className="text-primary-600" /> Tu IA esta semana</span></SectionTitle>
              <Card className="text-center text-sm text-ink-500">Tu IA aún no ha actuado esta semana.</Card>
            </section>
          );
        }
        const cards = [
          { Icon: MessageCircle, label: 'Conversaciones atendidas', value: ai.attended, hint: ai.autoResolvedPct !== null ? `${Math.round(ai.autoResolvedPct * 100)}% sin intervención` : `${ai.suggestions} sugerencias` },
          { Icon: Star, label: 'Leads puntuados', value: ai.leadsScored, hint: 'Lead scoring con IA' },
          { Icon: CalendarCheck, label: 'Reuniones agendadas', value: ai.meetings, hint: 'Por el agente' },
          { Icon: UserCog, label: 'Escaladas a humano', value: ai.escalations, hint: 'Casos derivados' },
        ];
        return (
          <section key={id}>
            <SectionTitle right={<span className="font-mono text-xs text-ink-500">últimos 7 días</span>}>
              <span className="flex items-center gap-2"><Sparkles size={16} strokeWidth={1.75} className="text-primary-600" /> Tu IA esta semana</span>
            </SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((t) => (
                <div key={t.label} className="rounded-lg border border-ink-100 bg-white p-5">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink-500"><t.Icon size={14} strokeWidth={1.75} /> {t.label}</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight">{t.value}</div>
                  <div className="mt-1 text-xs text-ink-500">{t.hint}</div>
                </div>
              ))}
            </div>
          </section>
        );
      }
      case 'funnel': {
        const max = Math.max(1, ...overview.leads.byStatus.map((s) => s.count));
        return (
          <section key={id}>
            <Card>
              <h3 className="text-sm font-mono uppercase tracking-wider text-ink-500">Embudo de leads</h3>
              <div className="mt-4 space-y-3">
                {overview.leads.byStatus.map((s) => (
                  <Bar key={s.status} label={leadStatusLabel[s.status] ?? s.status} value={s.count} max={max} color={leadStatusColor[s.status] ?? 'bg-ink-300'} />
                ))}
              </div>
            </Card>
          </section>
        );
      }
      case 'sources': {
        const max = Math.max(1, ...overview.leads.bySource.map((s) => s.count));
        return (
          <section key={id}>
            <Card>
              <h3 className="text-sm font-mono uppercase tracking-wider text-ink-500">Leads por fuente</h3>
              <div className="mt-4 space-y-3">
                {overview.leads.bySource.length === 0 ? (
                  <p className="text-sm text-ink-500">Sin datos de fuente.</p>
                ) : (
                  overview.leads.bySource.map((s) => <Bar key={s.source} label={s.source} value={s.count} max={max} color="bg-primary-500" />)
                )}
              </div>
            </Card>
          </section>
        );
      }
      case 'recent-docs':
        return (
          <section key={id}>
            <SectionTitle right={<Link href="/app/documents" className="text-xs text-primary-700 hover:underline">Ver todos →</Link>}>
              <span className="flex items-center gap-2"><FileText size={16} strokeWidth={1.75} className="text-ink-500" /> Documentos recientes</span>
            </SectionTitle>
            <Card>
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
          </section>
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
        <button type="button" onClick={editing ? cancelEdit : startEdit} className={buttonClass('ghost', 'flex shrink-0 items-center gap-1.5 text-sm')}>
          <SlidersHorizontal size={14} /> {editing ? 'Cancelar' : 'Editar panel'}
        </button>
      </header>

      <OnboardingChecklist steps={steps} />

      {editing && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Personaliza tu panel</h3>
            <button type="button" onClick={() => void save()} disabled={saving} className={buttonClass('primary', 'text-xs')}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          <p className="mb-2 text-xs text-ink-500">Activa las tarjetas que quieres ver y ordénalas con las flechas.</p>
          <ul className="space-y-1">
            {enabledDefs.map((w, i) => (
              <li key={w.id} className="flex items-center gap-2 rounded border border-ink-100 px-2 py-1.5 text-sm">
                <input type="checkbox" checked readOnly onClick={() => toggle(w.id)} className="cursor-pointer" />
                <span className="flex-1">{w.title}</span>
                <button type="button" onClick={() => move(w.id, -1)} disabled={i === 0} className="rounded p-1 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Subir"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => move(w.id, 1)} disabled={i === enabledDefs.length - 1} className="rounded p-1 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Bajar"><ArrowDown size={14} /></button>
              </li>
            ))}
            {disabledDefs.length > 0 && <li className="pt-1 text-[11px] uppercase tracking-wide text-ink-400">Ocultas</li>}
            {disabledDefs.map((w) => (
              <li key={w.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-500">
                <input type="checkbox" checked={false} readOnly onClick={() => toggle(w.id)} className="cursor-pointer" />
                <span className="flex-1">{w.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {order.length === 0 ? (
        <Card className="text-center text-sm text-ink-500">
          No hay tarjetas activas. Pulsa <strong>Editar panel</strong> para añadir alguna.
        </Card>
      ) : (
        order.map((id) => renderWidget(id))
      )}
    </div>
  );
}
