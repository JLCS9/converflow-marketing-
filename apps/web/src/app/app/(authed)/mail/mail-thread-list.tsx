'use client';

/**
 * Thread list column of the mail workspace: new-mail button, search box, the
 * thread rows and the keyset "load more".
 *
 * Split out of `mail-workspace.tsx` (was 929 lines and the largest file in the
 * repo) because the AI panels land in the thread column next, and both were
 * living in the same component.
 */

import { Inbox, Mail, Search, UserCheck, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/inbox-kit';
import { buttonClass } from '@/components/ui/primitives';
import type { ThreadRow } from './mail-types';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierto',
  PENDING: 'Pendiente',
  CLOSED: 'Cerrado',
};
const STATUS_DOT: Record<string, string> = {
  OPEN: 'bg-green-400',
  PENDING: 'bg-amber-400',
  CLOSED: 'bg-ink-300',
};

function timeShort(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export type MailStateFilter = 'active' | 'closed' | 'all';
export type MailAssignedFilter = 'all' | 'me' | 'none';

function Segment<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
}) {
  return (
    <div className="flex w-full rounded-md bg-ink-100 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors ${
            value === o.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MailThreadList({
  threads,
  selectedId,
  onSelect,
  query,
  onQuery,
  searching,
  loading,
  isPrivate,
  nameOf,
  nextCursor,
  loadingMore,
  onLoadMore,
  onNewMail,
  stateFilter,
  onStateFilter,
  assignedFilter,
  onAssignedFilter,
  mineUnread,
}: {
  threads: ThreadRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQuery: (v: string) => void;
  searching: boolean;
  loading: boolean;
  /** Private mailbox → no assignment avatars (there is no team to hand off to). */
  isPrivate: boolean;
  nameOf: (userId: string | null) => string;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  onNewMail: () => void;
  /** Estado de la conversación: activas (abiertas/pendientes), cerradas o todas. */
  stateFilter: MailStateFilter;
  onStateFilter: (v: MailStateFilter) => void;
  /** Asignación (solo buzones compartidos): todas, mías o sin asignar. */
  assignedFilter: MailAssignedFilter;
  onAssignedFilter: (v: MailAssignedFilter) => void;
  /** Hilos asignados a mí y sin leer para mí, para el badge de «Míos». */
  mineUnread: number;
}) {
  return (
  <div className="flex h-full flex-col">
    <div className="space-y-2 border-b border-ink-100 p-2">
      {/* En escritorio el botón y los filtros viven en el navbar lateral; en
          móvil esa columna no existe, así que se muestran aquí. */}
      <button
        type="button"
        onClick={() => onNewMail()}
        className={buttonClass('primary', 'flex w-full items-center justify-center gap-1.5 text-xs md:hidden')}
      >
        <Mail size={14} /> Nuevo correo
      </button>
      <div className="relative">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar en el correo…"
          className="w-full rounded border border-ink-200 bg-white px-2 py-1 pl-7 pr-6 text-xs focus:border-ink-700 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            aria-label="Limpiar búsqueda"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="space-y-2 md:hidden">
        <Segment
          label="Estado de la conversación"
          value={stateFilter}
          onChange={onStateFilter}
          options={[
            { value: 'active', label: 'Activas' },
            { value: 'closed', label: 'Cerradas' },
            { value: 'all', label: 'Todas' },
          ]}
        />
        {!isPrivate && (
          <Segment
            label="Asignación"
            value={assignedFilter}
            onChange={onAssignedFilter}
            options={[
              { value: 'all', label: 'Todos' },
              {
                value: 'me',
                label: (
                  <>
                    <UserCheck size={11} /> Míos
                    {mineUnread > 0 && (
                      <span className="rounded-full bg-primary-600 px-1 text-[9px] font-semibold leading-4 text-white">
                        {mineUnread > 99 ? '99+' : mineUnread}
                      </span>
                    )}
                  </>
                ),
              },
              { value: 'none', label: 'Sin asignar' },
            ]}
          />
        )}
      </div>
    </div>
    <div className="flex-1 overflow-y-auto">
      {loading && threads.length === 0 ? (
        <div className="space-y-3 p-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex animate-pulse gap-2.5">
              <div className="h-8 w-8 shrink-0 rounded-full bg-ink-100" />
              <div className="flex-1 space-y-1.5 py-0.5">
                <div className="h-3 w-2/3 rounded bg-ink-100" />
                <div className="h-2.5 w-1/2 rounded bg-ink-100" />
              </div>
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-ink-500">
          <Inbox size={28} className="text-ink-300" />
          {searching ? 'Sin resultados.' : 'Sin mensajes en esta carpeta.'}
        </div>
      ) : (
        threads.map((t) => {
          const unread = t.unreadForMe ?? t.unreadCount > 0;
          const people = (t.participants ?? []).filter(Boolean);
          const who = people[0] || 'Contacto';
          // Surface at a glance that a thread has more people on it — otherwise
          // you only discover the Cc list after opening it.
          const others = Math.max(people.length - 1, 0);
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`flex w-full gap-2.5 border-b border-ink-100 p-2.5 text-left hover:bg-ink-100/50 ${selectedId === t.id ? 'bg-primary-50' : ''}`}
            >
              <Avatar name={who} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[t.status] ?? 'bg-ink-300'}`} title={`Estado: ${STATUS_LABEL[t.status] ?? t.status}`} />
                    <span className={`truncate text-sm ${unread ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>{who}</span>
                    {others > 0 && (
                      <span
                        className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-ink-400"
                        title={`${people.length} participantes: ${people.join(', ')}`}
                      >
                        <Users size={10} />+{others}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] text-ink-400">{timeShort(t.lastMessageAt)}</span>
                </div>
                <div className={`truncate text-xs ${unread ? 'font-medium text-ink-800' : 'text-ink-500'}`}>{t.subject || '(sin asunto)'}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-ink-400">{t.snippet}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {t.unreadCount > 0 && (
                      <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-semibold text-white">{t.unreadCount}</span>
                    )}
                    {!isPrivate &&
                      (t.assigneeUserId ? (
                        <Avatar name={nameOf(t.assigneeUserId)} size="sm" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-dashed border-ink-300" title="Sin asignar" />
                      ))}
                  </span>
                </div>
              </div>
            </button>
          );
        })
      )}
      {nextCursor && (
        <button
          type="button"
          onClick={() => onLoadMore()}
          disabled={loadingMore}
          className="w-full border-b border-ink-100 py-2.5 text-xs text-primary-700 hover:bg-ink-100/50 disabled:text-ink-400"
        >
          {loadingMore ? 'Cargando…' : 'Cargar más correos'}
        </button>
      )}
    </div>
  </div>
  );
}
