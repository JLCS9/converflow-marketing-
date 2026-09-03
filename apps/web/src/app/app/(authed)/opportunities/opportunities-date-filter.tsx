'use client';

/**
 * Envoltorio del filtro de fechas compartido para Oportunidades: el rango
 * vive en la URL (mismo patrón que `contacts-filters.tsx`), así que
 * cualquier vista filtrada es enlazable/compartible.
 *
 * Filtra SOLO lo cerrado (ganado/perdido) — ver `OpportunitiesService.list`.
 * Lo abierto se ve siempre; el texto lo deja explícito para que nadie
 * confunda "no veo el trato de hace dos meses" con un bug.
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { PRESET_LABEL_KEY, PRESETS, type DateRangeValue } from '@/components/ui/date-range';

export function OpportunitiesDateFilter({ value }: { value: DateRangeValue }) {
  const t = useTranslations('dateRange');
  const tOpp = useTranslations('opportunities');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const labels = Object.fromEntries(PRESETS.map((p) => [p, t(PRESET_LABEL_KEY[p])])) as Record<
    (typeof PRESETS)[number],
    string
  >;

  const onChange = useCallback(
    (next: DateRangeValue) => {
      const q = new URLSearchParams(params.toString());
      q.set('preset', next.preset);
      q.set('from', next.from);
      q.set('to', next.to);
      router.replace(`${pathname}?${q.toString()}`);
    },
    [params, pathname, router],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-500">{tOpp('closedInRange')}</span>
      <DateRangeFilter value={value} onChange={onChange} labels={labels} />
    </div>
  );
}
