/**
 * Bloque de Inteligencia de Negocio · lógica pura de rango de fechas — SIN
 * `'use client'` a propósito: la usan tanto componentes cliente (el filtro,
 * el widget de ventas) como páginas de servidor (Oportunidades, que calcula
 * el rango por defecto ANTES de pedir datos al API). Si esta lógica viviera
 * en el mismo fichero que `<DateRangeFilter>` (que sí es `'use client'`),
 * Next.js trata TODO el módulo como límite de cliente y una página servidor
 * no puede invocar la función — exactamente el bug de producción que este
 * fichero corrige: "Attempted to call computeDateRange() from the server
 * but computeDateRange is on the client".
 */

export const PRESETS = ['7d', '30d', '90d', 'month', 'quarter', 'custom'] as const;
export type DateRangePreset = (typeof PRESETS)[number];

export interface DateRangeValue {
  preset: DateRangePreset;
  /** yyyy-mm-dd */
  from: string;
  /** yyyy-mm-dd */
  to: string;
}

export const PRESET_LABEL_KEY: Record<DateRangePreset, string> = {
  '7d': 'last7',
  '30d': 'last30',
  '90d': 'last90',
  month: 'thisMonth',
  quarter: 'thisQuarter',
  custom: 'custom',
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Rango efectivo de un preset — **últimos 30 días es el default de todo el
 * bloque de BI** (Oportunidades, el widget de ventas): quien llama sin
 * preset explícito recibe ese rango, no "todo el tiempo".
 */
export function computeDateRange(
  preset: DateRangePreset = '30d',
  custom?: { from?: string; to?: string },
): DateRangeValue {
  const today = new Date();
  switch (preset) {
    case '7d':
      return { preset, from: toDateStr(daysAgo(7)), to: toDateStr(today) };
    case '90d':
      return { preset, from: toDateStr(daysAgo(90)), to: toDateStr(today) };
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { preset, from: toDateStr(start), to: toDateStr(today) };
    }
    case 'quarter': {
      const q = Math.floor(today.getMonth() / 3);
      const start = new Date(today.getFullYear(), q * 3, 1);
      return { preset, from: toDateStr(start), to: toDateStr(today) };
    }
    case 'custom':
      return { preset, from: custom?.from ?? toDateStr(daysAgo(30)), to: custom?.to ?? toDateStr(today) };
    case '30d':
    default:
      return { preset: '30d', from: toDateStr(daysAgo(30)), to: toDateStr(today) };
  }
}
