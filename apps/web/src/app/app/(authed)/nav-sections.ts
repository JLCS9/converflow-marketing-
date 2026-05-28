export interface NavItem {
  href: string;
  label: string;
}

export interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

// Grouped sidebar sections — each is a single sidebar entry; its pages show as
// a top submenu (tabs) within the content area.
export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'crm',
    label: 'CRM',
    items: [
      { href: '/app/leads', label: 'Leads' },
      { href: '/app/opportunities', label: 'Oportunidades' },
      { href: '/app/clients', label: 'Clientes' },
    ],
  },
  {
    key: 'trabajo',
    label: 'Trabajo',
    items: [
      { href: '/app/tasks', label: 'Tareas' },
      { href: '/app/documents', label: 'Documentos' },
    ],
  },
  {
    key: 'ia',
    label: 'IA',
    items: [
      { href: '/app/bots', label: 'Bots' },
      { href: '/app/agents', label: 'Agentes IA' },
    ],
  },
  {
    key: 'config',
    label: 'Configuración',
    items: [
      { href: '/app/users', label: 'Usuarios' },
      { href: '/app/profile', label: 'Perfil' },
      { href: '/app/settings', label: 'Ajustes' },
    ],
  },
];

export function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findSection(pathname: string): NavSection | undefined {
  return NAV_SECTIONS.find((s) => s.items.some((it) => isItemActive(pathname, it.href)));
}
