'use client';

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  MessageCircle,
  Bell,
  Users,
  Bot,
  Megaphone,
  Settings,
  Plus,
  ChevronRight,
  Contact,
  ListChecks,
  Target,
  HelpCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/session-context';
import type { PermissionModule } from '@converflow/shared';
import {
  NAV_SECTIONS,
  SETTINGS_SECTION,
  isItemActive,
  isSectionActive,
  type NavSection,
} from './nav-sections';

/** ANY-match permission gate. Sections with no `requires` are always shown. */
function hasAny(perms: PermissionModule[], required?: PermissionModule[]): boolean {
  if (!required || required.length === 0) return true;
  return required.some((m) => perms.includes(m));
}

type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const sectionIcons: Record<string, IconType> = {
  crm: Users,
  ia: Bot,
  campaigns: Megaphone,
  config: Settings,
};

const createItems: {
  href: string;
  label: string;
  icon: IconType;
  requires?: PermissionModule[];
}[] = [
  { href: '/app/leads/new', label: 'Nuevo lead', icon: Contact, requires: ['crm'] },
  { href: '/app/tasks/new', label: 'Nueva tarea', icon: ListChecks, requires: ['crm'] },
  {
    href: '/app/opportunities/new',
    label: 'Nueva oportunidad',
    icon: Target,
    requires: ['crm'],
  },
  { href: '/app/bots/new', label: 'Nuevo bot', icon: Bot, requires: ['bots'] },
];

function Count({ n, color, collapsed }: { n: number; color: 'blue' | 'red'; collapsed?: boolean }) {
  if (n <= 0) return null;
  // Collapsed rail: a small corner dot instead of a full pill (no room for digits).
  if (collapsed) {
    return (
      <span
        aria-hidden
        className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-white ${
          color === 'blue' ? 'bg-primary-600' : 'bg-red-600'
        }`}
      />
    );
  }
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

const itemCls = (active: boolean, collapsed?: boolean) =>
  `group relative flex w-full items-center rounded-md py-2 transition-colors ${
    collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
  } ${active ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-700 hover:bg-ink-100'}`;

/** Clean hover label for the collapsed icon rail. */
function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100">
      {label}
    </span>
  );
}

function SectionLink({
  section,
  pathname,
  collapsed,
}: {
  section: NavSection;
  pathname: string;
  collapsed?: boolean;
}) {
  const Icon = sectionIcons[section.key];
  const active = isSectionActive(pathname, section);
  return (
    <Link
      href={section.defaultHref}
      className={itemCls(active, collapsed)}
      aria-label={collapsed ? section.label : undefined}
    >
      {Icon && <Icon size={18} strokeWidth={1.75} aria-hidden />}
      {!collapsed && <span>{section.label}</span>}
      {collapsed && <Tip label={section.label} />}
    </Link>
  );
}

export function SidebarNav({
  convPending,
  alertCount,
  collapsed = false,
}: {
  convPending: number;
  alertCount: number;
  collapsed?: boolean;
}) {
  const pathname = usePathname() ?? '';
  const session = useSession();
  const perms = session.permissions;
  const isOwner = session.role === 'OWNER';
  const visibleCreate = createItems.filter(
    (c) => isOwner || hasAny(perms, c.requires),
  );
  const visibleSections = NAV_SECTIONS.filter(
    (s) => isOwner || hasAny(perms, s.requires),
  );
  const showConversations = isOwner || perms.includes('conversations');
  const showSettings = isOwner || hasAny(perms, SETTINGS_SECTION.requires);
  const [pending, setPending] = useState(convPending);
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
    // 20s is plenty for an unread badge; 5s × every open tab was needless DB load.
    const t = setInterval(poll, 20000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return (
    <>
      {visibleCreate.length > 0 && (
        <div className="relative shrink-0 px-3 pb-1 pt-3">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="Atajos de creación"
            className={`group relative flex w-full items-center justify-center rounded-md bg-ink-900 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-700 ${
              collapsed ? 'px-0' : 'gap-2 px-3'
            }`}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            {!collapsed ? (
              <>
                Crear
                <ChevronRight
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden
                  className={`transition-transform ${menu ? 'rotate-90' : ''}`}
                />
              </>
            ) : (
              <Tip label="Crear" />
            )}
          </button>
          {menu && (
            <div
              className={`z-30 rounded-md border border-ink-100 bg-white p-1 shadow-[0_4px_12px_-2px_rgb(10_10_10/.10)] ${
                collapsed ? 'absolute left-full top-3 ml-1 w-48' : 'absolute left-3 right-3 mt-1'
              }`}
              onMouseLeave={() => setMenu(false)}
            >
              {visibleCreate.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  onClick={() => setMenu(false)}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-700 hover:bg-ink-100"
                >
                  <c.icon size={16} strokeWidth={1.75} aria-hidden />
                  {c.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-visible px-3 pb-4 pt-2 text-sm">
        <Link
          href="/app"
          className={itemCls(pathname === '/app', collapsed)}
          aria-label={collapsed ? 'Inicio' : undefined}
        >
          <Home size={18} strokeWidth={1.75} aria-hidden />
          {!collapsed && <span>Inicio</span>}
          {collapsed && <Tip label="Inicio" />}
        </Link>
        {showConversations && (
          <Link
            href="/app/conversations"
            className={itemCls(pathname.startsWith('/app/conversations'), collapsed)}
            aria-label={collapsed ? 'Conversaciones' : undefined}
          >
            <MessageCircle size={18} strokeWidth={1.75} aria-hidden />
            {!collapsed && <span>Conversaciones</span>}
            <Count n={pending} color="blue" collapsed={collapsed} />
            {collapsed && <Tip label="Conversaciones" />}
          </Link>
        )}
        <Link
          href="/app/alerts"
          className={itemCls(pathname.startsWith('/app/alerts'), collapsed)}
          aria-label={collapsed ? 'Alertas' : undefined}
        >
          <Bell size={18} strokeWidth={1.75} aria-hidden />
          {!collapsed && <span>Alertas</span>}
          <Count n={alertCount} color="red" collapsed={collapsed} />
          {collapsed && <Tip label="Alertas" />}
        </Link>

        {visibleSections.length > 0 && (
          <div className="my-2 border-t border-ink-100" aria-hidden />
        )}

        {visibleSections.map((s) => (
          <SectionLink key={s.key} section={s} pathname={pathname} collapsed={collapsed} />
        ))}
      </nav>

      {/* Ayuda + Configuración pinned to the bottom — primary nav stays uncluttered. */}
      <div className="shrink-0 space-y-0.5 border-t border-ink-100 px-3 py-2 text-sm">
        <Link
          href="/app/ayuda"
          className={itemCls(pathname.startsWith('/app/ayuda'), collapsed)}
          aria-label={collapsed ? 'Ayuda' : undefined}
        >
          <HelpCircle size={18} strokeWidth={1.75} aria-hidden />
          {!collapsed && <span>Ayuda</span>}
          {collapsed && <Tip label="Ayuda" />}
        </Link>
        {showSettings && (
          <SectionLink section={SETTINGS_SECTION} pathname={pathname} collapsed={collapsed} />
        )}
      </div>
    </>
  );
}

// Keep the deprecated re-exports so any orphan import doesn't blow up the build.
export const _unused = { isItemActive };
