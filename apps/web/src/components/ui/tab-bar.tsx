'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  href: string;
  /** Texto literal. Se usa cuando no hay `labelKey`. */
  label: string;
  /**
   * Clave del diccionario. Los presets de sección la usan para poder
   * traducirse: son constantes de módulo, así que no pueden llamar al hook de
   * traducción donde se declaran.
   */
  labelKey?: string;
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
  const t = useTranslations();
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label={t('uiBits.sections')}
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
            <span>{it.labelKey ? t(it.labelKey) : it.label}</span>
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
  { href: '/app/contacts', label: 'Contactos', labelKey: 'contacts.title' },
  { href: '/app/opportunities', label: 'Oportunidades', labelKey: 'opportunities.title' },
];

export const IA_TABS: TabItem[] = [
  { href: '/app/bots', label: 'Bots', labelKey: 'uiBits.tabBots' },
  { href: '/app/agents', label: 'Agentes IA', labelKey: 'uiBits.tabAgents' },
  { href: '/app/knowledge', label: 'Conocimiento', labelKey: 'uiBits.tabKnowledge' },
];

export const SETTINGS_TABS: TabItem[] = [
  { href: '/app/settings', label: 'Ajustes', labelKey: 'uiBits.tabSettings' },
  { href: '/app/users', label: 'Usuarios', labelKey: 'uiBits.tabUsers' },
  { href: '/app/profile', label: 'Perfil', labelKey: 'uiBits.tabProfile' },
  { href: '/app/settings/custom-fields', label: 'Campos personalizados', labelKey: 'uiBits.tabCustomFields' },
  { href: '/app/settings/pipelines', label: 'Tableros', labelKey: 'uiBits.tabPipelines' },
  { href: '/app/settings/developer', label: 'Desarrollador', labelKey: 'uiBits.tabDeveloper' },
];
