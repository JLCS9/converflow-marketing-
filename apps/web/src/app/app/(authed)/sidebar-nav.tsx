'use client';

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  MessageCircle,
  Bell,
  Users,
  Briefcase,
  Bot,
  Settings,
  Plus,
  ChevronRight,
  Contact,
  ListChecks,
  Target,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { NAV_SECTIONS, findSection, isItemActive } from './nav-sections';

type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const sectionIcons: Record<string, IconType> = {
  crm: Users,
  trabajo: Briefcase,
  ia: Bot,
  config: Settings,
};

const createItems: { href: string; label: string; icon: IconType }[] = [
  { href: '/app/leads/new', label: 'Nuevo lead', icon: Contact },
  { href: '/app/tasks/new', label: 'Nueva tarea', icon: ListChecks },
  { href: '/app/opportunities/new', label: 'Nueva oportunidad', icon: Target },
  { href: '/app/bots/new', label: 'Nuevo bot', icon: Bot },
];

function Count({ n, color }: { n: number; color: 'blue' | 'red' }) {
  if (n <= 0) return null;
  return (
    <span
      className={`ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white ${
        color === 'blue' ? 'bg-primary-600' : 'bg-red-600'
      }`}
    >
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
  const activeSection = findSection(pathname);
  const [open, setOpen] = useState<Record<string, boolean>>(
    activeSection ? { [activeSection.key]: true } : {},
  );
  const [menu, setMenu] = useState(false);

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

  const itemCls = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-3 py-2 transition-colors ${
      active ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-700 hover:bg-ink-100'
    }`;

  return (
    <>
      <div className="relative shrink-0 px-3 pb-1 pt-3">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label="Atajos de creación"
          title="Atajos de creación"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-ink-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-700"
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden /> Crear
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className={`transition-transform ${menu ? 'rotate-90' : ''}`}
          />
        </button>
        {menu && (
          <div
            className="absolute left-3 right-3 z-20 mt-1 rounded-md border border-ink-100 bg-white p-1 shadow-[0_4px_12px_-2px_rgb(10_10_10/.10)]"
            onMouseLeave={() => setMenu(false)}
          >
            {createItems.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                onClick={() => setMenu(false)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-700 hover:bg-ink-100"
              >
                <c.icon size={16} strokeWidth={1.75} />
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 pt-2 text-sm">
        <Link href="/app" className={itemCls(pathname === '/app')}>
          <Home size={18} strokeWidth={1.75} />
          <span>Inicio</span>
        </Link>
        <Link href="/app/conversations" className={itemCls(pathname.startsWith('/app/conversations'))}>
          <MessageCircle size={18} strokeWidth={1.75} />
          <span>Conversaciones</span>
          <Count n={pending} color="blue" />
        </Link>
        <Link href="/app/alerts" className={itemCls(pathname.startsWith('/app/alerts'))}>
          <Bell size={18} strokeWidth={1.75} />
          <span>Alertas</span>
          <Count n={alertCount} color="red" />
        </Link>

        {NAV_SECTIONS.map((s) => {
          const Icon = sectionIcons[s.key];
          const isOpen = !!open[s.key];
          const activeChild = activeSection?.key === s.key;
          return (
            <div key={s.key}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Contraer' : 'Expandir'} ${s.label}`}
                className={itemCls(activeChild && !isOpen)}
              >
                {Icon && <Icon size={18} strokeWidth={1.75} aria-hidden />}
                <span>{s.label}</span>
                <ChevronRight
                  size={15}
                  strokeWidth={1.75}
                  aria-hidden
                  className={`ml-auto transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {isOpen && (
                <div className="ml-[18px] mt-0.5 space-y-0.5 border-l border-ink-100 pl-3">
                  {s.items.map((it) => {
                    const active = isItemActive(pathname, it.href);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                          active
                            ? 'font-medium text-primary-700'
                            : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                        }`}
                      >
                        <span
                          className={`h-1 w-1 rounded-full ${active ? 'bg-primary-600' : 'bg-ink-300'}`}
                        />
                        {it.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}
