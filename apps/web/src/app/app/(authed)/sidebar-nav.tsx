'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { NAV_SECTIONS, findSection } from './nav-sections';

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function SidebarNav({
  convPending,
  alertCount,
}: {
  convPending: number;
  alertCount: number;
}) {
  const pathname = usePathname() ?? '';
  const [pending, setPending] = useState(convPending);

  // Live "pendientes" badge for Conversaciones.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const r = await apiFetch<{ pending: number }>('/conversations/count');
        if (active) setPending(r.pending);
      } catch {
        /* keep last */
      }
    };
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const activeSectionKey = findSection(pathname)?.key;

  const cls = (active: boolean) =>
    `flex items-center justify-between rounded px-3 py-1.5 ${
      active ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-700 hover:bg-ink-100'
    }`;

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 text-sm">
      <Link href="/app" className={cls(pathname === '/app')}>
        <span>Inicio</span>
      </Link>
      <Link href="/app/conversations" className={cls(pathname.startsWith('/app/conversations'))}>
        <span>Conversaciones</span>
        <Badge n={pending} />
      </Link>
      <Link href="/app/alerts" className={cls(pathname.startsWith('/app/alerts'))}>
        <span>Alertas</span>
        <Badge n={alertCount} />
      </Link>

      <div className="pt-3" />
      {NAV_SECTIONS.map((s) => (
        <Link key={s.key} href={s.items[0]!.href} className={cls(activeSectionKey === s.key)}>
          <span>{s.label}</span>
        </Link>
      ))}
    </nav>
  );
}
