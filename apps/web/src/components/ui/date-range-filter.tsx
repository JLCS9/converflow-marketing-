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
 *
 * Solo el COMPONENTE vive aquí — la lógica de rango (`computeDateRange` y
 * compañía) vive en `./date-range.ts`, SIN `'use client'`, precisamente para
 * que una página de servidor (Oportunidades) pueda invocarla. Mezclar ambas
 * cosas en un módulo `'use client'` es justo lo que rompió esa página en
 * producción: Next.js no deja llamar a una función de un módulo cliente
 * desde el servidor, aunque sea pura y sin hooks.
 */

import { PRESETS, type DateRangePreset, type DateRangeValue, computeDateRange } from './date-range';

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
