'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { findSection, isItemActive } from './nav-sections';

/**
 * Top submenu (tabs) for grouped sections. Renders nothing on pages that aren't
 * part of a section (Inicio, Conversaciones, Alertas).
 */
export function SectionTabs() {
  const pathname = usePathname() ?? '';
  const section = findSection(pathname);
  if (!section) return null;

  return (
    <div className="border-b border-ink-100 bg-white px-8">
      <div className="flex flex-wrap gap-1">
        {section.items.map((it) => {
          const active = isItemActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`-mb-px border-b-2 px-3 py-3 text-sm ${
                active
                  ? 'border-primary-600 font-medium text-ink-900'
                  : 'border-transparent text-ink-500 hover:text-ink-900'
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
