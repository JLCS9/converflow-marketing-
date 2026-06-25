'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Shared inbox layout kit (respond.io-style). Used by both Mensajería (IM) and
 * Correo so the page division stays consistent: filters | list | thread | details.
 */

// ---- column scaffold ----------------------------------------------------

export function InboxShell({
  filters,
  list,
  thread,
  details,
  hasSelection,
}: {
  filters: ReactNode;
  list: ReactNode;
  thread: ReactNode;
  /** Right details panel; rendered (xl+) only when provided. */
  details?: ReactNode;
  /** When a thread is open, the list collapses on smaller screens to show it. */
  hasSelection: boolean;
}) {
  return (
    <div className="flex h-[calc(100dvh-9.5rem)] overflow-hidden rounded-lg border border-ink-100 bg-white">
      <aside className="hidden w-44 shrink-0 flex-col overflow-y-auto border-r border-ink-100 bg-ink-50/40 md:flex">
        {filters}
      </aside>
      <section
        className={`${hasSelection ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col overflow-hidden border-r border-ink-100 lg:w-[17rem]`}
      >
        {list}
      </section>
      <section className={`${hasSelection ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
        {thread}
      </section>
      {details && (
        <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-l border-ink-100 xl:flex">
          {details}
        </aside>
      )}
    </div>
  );
}

// ---- avatar -------------------------------------------------------------

const AVATAR_COLORS = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
];

function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls =
    size === 'lg' ? 'h-12 w-12 text-base' : size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${cls} ${colorFor(name || '?')}`}
      aria-hidden
    >
      {initialsOf(name || '?')}
    </span>
  );
}

// ---- thread chrome ------------------------------------------------------

export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center justify-center">
      <span className="rounded-full bg-ink-100 px-3 py-0.5 text-[11px] font-medium text-ink-500">{label}</span>
    </div>
  );
}

export function SystemEvent({ children }: { children: ReactNode }) {
  return <div className="my-1.5 text-center text-[11px] text-ink-400">{children}</div>;
}

// ---- right details panel ------------------------------------------------

export interface ContactField {
  label: string;
  value: ReactNode;
}

export function ContactPanel({
  name,
  sub,
  fields,
  onClose,
}: {
  name: string;
  sub?: string | null;
  fields: ContactField[];
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <span className="text-sm font-semibold">Contacto</span>
        {onClose && (
          <button onClick={onClose} aria-label="Cerrar panel" className="text-ink-400 hover:text-ink-700">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex w-full flex-col items-center gap-2 border-b border-ink-100 p-4 text-center">
        <Avatar name={name} size="lg" />
        <div className="w-full min-w-0">
          <div className="break-words text-sm font-medium leading-tight text-ink-900">{name}</div>
          {sub && <div className="mt-0.5 break-all text-xs text-ink-500">{sub}</div>}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {fields.map((f, i) => (
          <div key={i}>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{f.label}</div>
            <div className="mt-0.5 break-words text-ink-800">{f.value || '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- reply / internal-note tabs ----------------------------------------

export function ReplyNoteTabs({
  tab,
  onTab,
  reply,
  note,
  noteCount,
}: {
  tab: 'reply' | 'note';
  onTab: (t: 'reply' | 'note') => void;
  reply: ReactNode;
  note: ReactNode;
  noteCount?: number;
}) {
  const tabCls = (active: boolean, amber?: boolean) =>
    `rounded-t-md px-3 py-1.5 text-xs font-medium ${
      active
        ? amber
          ? 'bg-amber-50 text-amber-800'
          : 'bg-white text-ink-900 shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-ink-900'
        : 'text-ink-500 hover:text-ink-800'
    }`;
  return (
    <div className="border-t border-ink-100 bg-white">
      <div className="flex gap-1 px-3 pt-2">
        <button type="button" onClick={() => onTab('reply')} className={tabCls(tab === 'reply')}>
          Responder
        </button>
        <button type="button" onClick={() => onTab('note')} className={tabCls(tab === 'note', true)}>
          Nota interna{noteCount ? ` (${noteCount})` : ''}
        </button>
      </div>
      <div className={`p-3 ${tab === 'note' ? 'bg-amber-50/40' : ''}`}>{tab === 'reply' ? reply : note}</div>
    </div>
  );
}
