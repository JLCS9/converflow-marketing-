import type { PermissionModule } from '@converflow/shared';

export interface NavItem {
  href: string;
  label: string;
  /** Modules required to show this item (ANY match is enough). */
  requires?: PermissionModule[];
}

export interface NavSection {
  key: string;
  label: string;
  /** Default landing route when the section is clicked. */
  defaultHref: string;
  /** Routes that belong to this section (used for active highlight). */
  routes: string[];
  /** Modules required to show this section in the sidebar (ANY match). */
  requires?: PermissionModule[];
}

// Flat sidebar: each section is a single entry. The actual sub-navigation
// lives in the page-level <TabBar> on top of every listing page (see
// /components/ui/tab-bar.tsx for the CRM_TABS, IA_TABS, SETTINGS_TABS sets).
//
// Trabajo (Tareas + Documentos) doesn't get a sidebar entry — it surfaces as
// blocks on /app (Inicio). Their full pages are still reachable directly.
export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'crm',
    label: 'CRM',
    defaultHref: '/app/leads',
    routes: ['/app/leads', '/app/opportunities', '/app/clients'],
    requires: ['crm'],
  },
  {
    key: 'ia',
    label: 'IA',
    defaultHref: '/app/bots',
    routes: ['/app/bots', '/app/agents'],
    requires: ['agents', 'bots'],
  },
  {
    key: 'campaigns',
    label: 'Campañas',
    defaultHref: '/app/campaigns',
    routes: ['/app/campaigns'],
    requires: ['campaigns'],
  },
];

/**
 * Settings still needs ANY of `settings` or `users` to show — the section
 * itself is multi-purpose (custom fields, pipelines, user management,
 * profile). /app/profile is always reachable directly, so even users
 * without settings/users can still get to their own profile.
 */
export const SETTINGS_SECTION: NavSection = {
  key: 'config',
  label: 'Configuración',
  defaultHref: '/app/settings',
  routes: [
    '/app/settings',
    '/app/users',
    '/app/profile',
    '/app/settings/custom-fields',
    '/app/settings/pipelines',
  ],
  requires: ['settings', 'users'],
};

export function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSectionActive(pathname: string, section: NavSection): boolean {
  return section.routes.some((r) => isItemActive(pathname, r));
}
