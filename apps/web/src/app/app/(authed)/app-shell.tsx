'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { LogoutButton } from './logout-button';
import { SidebarNav } from './sidebar-nav';
import { PoliciesBanner } from './policies-banner';

interface Props {
  tenantName: string;
  userEmail: string;
  userRole: string;
  mustChangePassword: boolean;
  convPending: number;
  alertCount: number;
  children: ReactNode;
}

/**
 * Authed shell. Below md: top bar with hamburger; sidebar slides in as a
 * drawer with backdrop. From md: classic side-by-side layout.
 *
 * The drawer auto-closes on route change so the user lands directly on the
 * new page after picking a sidebar item.
 */
export function AppShell({
  tenantName,
  userEmail,
  userRole,
  mustChangePassword,
  convPending,
  alertCount,
  children,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapsed preference (desktop rail). Read once on mount.
  useEffect(() => {
    setCollapsed(localStorage.getItem('cf-sidebar-collapsed') === '1');
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('cf-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  }

  // Close drawer when navigating
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open on mobile
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const desktopSidebar = (
    <>
      <div
        className={`flex shrink-0 items-center border-b border-ink-100 py-[14px] ${
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expandir menú"
            title="Expandir menú"
            className="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            <PanelLeftOpen size={18} strokeWidth={1.75} />
          </button>
        ) : (
          <>
            <div className="min-w-0">
              <div className="font-semibold tracking-tight">
                converflow<span className="text-primary-600">.ai</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-ink-500">{tenantName}</div>
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Contraer menú"
              title="Contraer menú"
              className="shrink-0 rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            >
              <PanelLeftClose size={18} strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>
      <SidebarNav convPending={convPending} alertCount={alertCount} collapsed={collapsed} />
      {!collapsed && (
        <div className="shrink-0 border-t border-ink-100 px-4 py-3 text-xs">
          <div className="text-ink-500">Conectado como</div>
          <div className="truncate font-medium text-ink-900">{userEmail}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500">
            {userRole}
          </div>
          <LogoutButton />
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-400">
            <Link href="/app/ayuda" className="hover:text-ink-700">
              Ayuda
            </Link>
            <Link href="/ai-disclosure" target="_blank" className="hover:text-ink-700">
              Aviso IA
            </Link>
            <Link href="/privacy" target="_blank" className="hover:text-ink-700">
              Privacidad
            </Link>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-ink-100/30">
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-ink-100 bg-white transition-[width] duration-200 md:flex ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {desktopSidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-ink-100 bg-white transition-transform md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Menú lateral"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">
            converflow<span className="text-primary-600">.ai</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="text-xs text-ink-500 px-4 pb-2">{tenantName}</div>
        <SidebarNav convPending={convPending} alertCount={alertCount} />
        <div className="shrink-0 border-t border-ink-100 px-4 py-3 text-xs">
          <div className="text-ink-500">Conectado como</div>
          <div className="truncate font-medium text-ink-900">{userEmail}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500">
            {userRole}
          </div>
          <LogoutButton />
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-400">
            <Link href="/app/ayuda" className="hover:text-ink-700">
              Ayuda
            </Link>
            <Link href="/ai-disclosure" target="_blank" className="hover:text-ink-700">
              Aviso IA
            </Link>
            <Link href="/privacy" target="_blank" className="hover:text-ink-700">
              Privacidad
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-ink-100 bg-white px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="rounded p-1.5 text-ink-700 hover:bg-ink-100"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <span className="text-sm font-semibold tracking-tight">
            converflow<span className="text-primary-600">.ai</span>
          </span>
          <span className="ml-auto truncate text-xs text-ink-500">{tenantName}</span>
        </div>

        {mustChangePassword && (
          <div className="shrink-0 border-b border-amber-300 bg-amber-100 px-6 py-2 text-xs text-amber-900">
            ⚠️ Estás usando una contraseña temporal.{' '}
            <Link href="/app/profile" className="underline">
              Cámbiala
            </Link>{' '}
            antes de seguir.
          </div>
        )}
        <PoliciesBanner />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
