export interface NavItem {
  href: string;
  label: string;
}

export interface NavSection {
  key: string;
  label: string;
  /** Default landing route when the section is clicked. */
  defaultHref: string;
  /** Routes that belong to this section (used for active highlight). */
  routes: string[];
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
  },
  {
    key: 'ia',
    label: 'IA',
    defaultHref: '/app/bots',
    routes: ['/app/bots', '/app/agents'],
  },
];

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
};

export function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSectionActive(pathname: string, section: NavSection): boolean {
  return section.routes.some((r) => isItemActive(pathname, r));
}
