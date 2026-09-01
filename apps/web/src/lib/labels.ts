/**
 * Central UI labels for backend enums. Avoids the Spanish/English mix in
 * dropdowns and badges across the tenant area.
 *
 * Keys remain the canonical enum values used by the API.
 */

// Los TEXTOS de estado viven en los diccionarios i18n (namespace `labels`):
// usa useLabelMaps() / getLabelMaps(). Aquí solo quedan colores y helpers.
export type BadgeColor = 'gray' | 'green' | 'yellow' | 'red' | 'blue';

// 3-state model. The DB enum still holds legacy values (NEW/CONTACTED/
// QUALIFIED/CONVERTED) for one deploy while the seed migrates rows; we keep
// labels for them so badges don't render as raw enum strings during the
// transition.
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
export const OPP_STATUS_COLOR: Record<string, BadgeColor> = {
  OPEN: 'gray',
  QUOTED: 'blue',
  NEGOTIATING: 'yellow',
  WON: 'green',
  LOST: 'red',
};

export const CLIENT_STATUS_COLOR: Record<string, BadgeColor> = {
  ACTIVE: 'green',
  INACTIVE: 'yellow',
  ARCHIVED: 'gray',
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

export const AGENT_STATUS_COLOR: Record<string, BadgeColor> = {
  DRAFT: 'gray',
  PUBLISHED: 'green',
  ARCHIVED: 'yellow',
};

export const TASK_STATUS_COLOR: Record<string, BadgeColor> = {
  PENDING: 'gray',
  IN_PROGRESS: 'blue',
  DONE: 'green',
  CANCELLED: 'yellow',
};

export const PRIORITY_COLOR: Record<string, BadgeColor> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'yellow',
  URGENT: 'red',
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

