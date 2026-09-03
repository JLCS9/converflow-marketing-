'use client';

/**
 * Bloque de Inteligencia de Negocio · filtro de fechas único y compartido.
 * Un solo componente para las dos pantallas que necesitan "cuánto pasó en
 * este periodo" (Oportunidades y el widget de ventas del panel de inicio),
 * en vez de un `<input type="date">` reinventado en cada sitio.
 *
 * Deliberadamente "tonto": no sabe si el rango vive en la URL (Oportunidades,
 * vía `router.replace`) o en estado local (el widget de inicio, para no
 * recargar la página) — quien lo usa decide con `value`/`onChange`.
 */

const PRESETS = ['7d', '30d', '90d', 'month', 'quarter', 'custom'] as const;
export type DateRangePreset = (typeof PRESETS)[number];

export interface DateRangeValue {
  preset: DateRangePreset;
  /** yyyy-mm-dd */
  from: string;
  /** yyyy-mm-dd */
  to: string;
}

const PRESET_LABEL_KEY: Record<DateRangePreset, string> = {
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

const selectCls =
  'rounded-md border border-ink-200 bg-white py-1.5 pl-2 pr-8 text-xs text-ink-700 focus:border-ink-700 focus:outline-none';

export function DateRangeFilter({
  value,
  onChange,
  labels,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** i18n resuelto por quien llama (server/client components difieren en cómo cargan next-intl). */
  labels: Record<DateRangePreset, string>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.preset}
        onChange={(e) => {
          const preset = e.target.value as DateRangePreset;
          onChange(preset === 'custom' ? { ...value, preset } : computeDateRange(preset));
        }}
        className={selectCls}
        aria-label={labels['30d']}
      >
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {labels[p]}
          </option>
        ))}
      </select>
      {value.preset === 'custom' && (
        <>
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className={selectCls}
          />
          <span className="text-xs text-ink-400">–</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className={selectCls}
          />
        </>
      )}
    </div>
  );
}

export { PRESET_LABEL_KEY, PRESETS };
