'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  href: string;
  label: string;
  badge?: number;
}

interface Props {
  items: TabItem[];
  className?: string;
  /** Optional right-aligned slot (e.g. a settings button). */
  action?: ReactNode;
}

/**
 * Top-of-page tab bar. Active state is detected by exact match or by
 * pathname starting with `href + "/"` (so detail pages keep their parent tab
 * highlighted).
 */
export function TabBar({ items, className, action }: Props) {
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label="Secciones"
      className={cn(
        '-mx-4 -mt-2 mb-2 flex items-center gap-1 overflow-x-auto border-b border-ink-100 px-4 pb-0 sm:mx-0 sm:px-0',
        className,
      )}
    >
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'text-ink-900'
                : 'text-ink-500 hover:text-ink-700',
            )}
          >
            <span>{it.label}</span>
            {it.badge != null && it.badge > 0 && (
              <span
                className={cn(
                  'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  active ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-700',
                )}
              >
                {it.badge > 99 ? '99+' : it.badge}
              </span>
            )}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-t bg-ink-900"
              />
            )}
          </Link>
        );
      })}
      {action && <div className="ml-auto flex shrink-0 items-center pb-1 pl-2">{action}</div>}
    </nav>
  );
}

// Section presets — keep them here so every page reads the same source of truth.
export const CRM_TABS: TabItem[] = [
  { href: '/app/leads', label: 'Leads' },
  { href: '/app/opportunities', label: 'Oportunidades' },
  { href: '/app/clients', label: 'Clientes' },
];

export const IA_TABS: TabItem[] = [
  { href: '/app/bots', label: 'Bots' },
  { href: '/app/agents', label: 'Agentes IA' },
];

export const SETTINGS_TABS: TabItem[] = [
  { href: '/app/settings', label: 'Ajustes' },
  { href: '/app/users', label: 'Usuarios' },
  { href: '/app/profile', label: 'Perfil' },
  { href: '/app/settings/custom-fields', label: 'Campos personalizados' },
  { href: '/app/settings/pipelines', label: 'Tableros' },
  { href: '/app/settings/developer', label: 'Desarrollador' },
];
