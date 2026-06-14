/**
 * Central UI labels for backend enums. Avoids the Spanish/English mix in
 * dropdowns and badges across the tenant area.
 *
 * Keys remain the canonical enum values used by the API.
 */

export type BadgeColor = 'gray' | 'green' | 'yellow' | 'red' | 'blue';

// 3-state model. The DB enum still holds legacy values (NEW/CONTACTED/
// QUALIFIED/CONVERTED) for one deploy while the seed migrates rows; we keep
// labels for them so badges don't render as raw enum strings during the
// transition.
export const LEAD_STATUS: Record<string, string> = {
  LEAD: 'Lead',
  CLIENT: 'Cliente',
  LOST: 'Perdido',
  NEW: 'Lead',
  CONTACTED: 'Lead',
  QUALIFIED: 'Lead',
  CONVERTED: 'Cliente',
};

export const LEAD_STATUS_COLOR: Record<string, BadgeColor> = {
  LEAD: 'blue',
  CLIENT: 'green',
  LOST: 'red',
  NEW: 'blue',
  CONTACTED: 'blue',
  QUALIFIED: 'blue',
  CONVERTED: 'green',
};

// Only the three values that are exposed in the UI dropdowns. Used by the
// create/edit forms and by the list filter.
export const LEAD_STATUS_OPTIONS: Array<{ value: 'LEAD' | 'CLIENT' | 'LOST'; label: string }> = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'CLIENT', label: 'Cliente' },
  { value: 'LOST', label: 'Perdido' },
];

export const OPP_STATUS: Record<string, string> = {
  OPEN: 'Abierta',
  QUOTED: 'Propuesta enviada',
  NEGOTIATING: 'Negociación',
  WON: 'Ganada',
  LOST: 'Perdida',
};

export const OPP_STATUS_COLOR: Record<string, BadgeColor> = {
  OPEN: 'gray',
  QUOTED: 'blue',
  NEGOTIATING: 'yellow',
  WON: 'green',
  LOST: 'red',
};

export const CLIENT_STATUS: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  ARCHIVED: 'Archivado',
};

export const CLIENT_STATUS_COLOR: Record<string, BadgeColor> = {
  ACTIVE: 'green',
  INACTIVE: 'yellow',
  ARCHIVED: 'gray',
};

export const BOT_STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  AWAITING_QR: 'Esperando QR',
  CONNECTING: 'Conectando',
  CONNECTED: 'Conectado',
  DISCONNECTED: 'Desconectado',
  BANNED: 'Bloqueado',
  ERROR: 'Error',
};

export const BOT_STATUS_COLOR: Record<string, BadgeColor> = {
  PENDING: 'gray',
  AWAITING_QR: 'yellow',
  CONNECTING: 'blue',
  CONNECTED: 'green',
  DISCONNECTED: 'yellow',
  BANNED: 'red',
  ERROR: 'red',
};

export const AGENT_STATUS: Record<string, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

export const AGENT_STATUS_COLOR: Record<string, BadgeColor> = {
  DRAFT: 'gray',
  PUBLISHED: 'green',
  ARCHIVED: 'yellow',
};

export const TASK_STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  DONE: 'Hecha',
  CANCELLED: 'Cancelada',
};

export const TASK_STATUS_COLOR: Record<string, BadgeColor> = {
  PENDING: 'gray',
  IN_PROGRESS: 'blue',
  DONE: 'green',
  CANCELLED: 'yellow',
};

export const TASK_TYPE: Record<string, string> = {
  CALL: 'Llamada',
  EMAIL: 'Email',
  MEETING: 'Reunión',
  FOLLOW_UP: 'Seguimiento',
  SUPPORT: 'Soporte',
  OTHER: 'Otro',
};

export const PRIORITY: Record<string, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const PRIORITY_COLOR: Record<string, BadgeColor> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'yellow',
  URGENT: 'red',
};

export const CHANNEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  WEBCHAT: 'Web Chat',
  EMAIL: 'Email',
};

export function statusLabel(map: Record<string, string>, value: string | null | undefined): string {
  if (value == null) return '—';
  return map[value] ?? value;
}

export function statusColor(
  map: Record<string, BadgeColor>,
  value: string | null | undefined,
): BadgeColor {
  if (value == null) return 'gray';
  return map[value] ?? 'gray';
}

