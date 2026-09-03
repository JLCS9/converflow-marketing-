'use client';

/**
 * Widget «Ventas» del panel de inicio — bloque de Inteligencia de Negocio.
 * A diferencia del resto de widgets (que pintan datos ya traídos por el
 * servidor), este lleva su PROPIO selector de rango de fechas: cambiar el
 * preset vuelve a pedir `/reports/economics` sin recargar la página, para
 * poder preguntar "cuánto vendimos" de un vistazo y en el periodo que
 * interese, no solo los últimos 7 días fijos del resto del panel.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ShoppingBag, Receipt, TrendingUp } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/primitives';
import { DateRangeFilter, PRESET_LABEL_KEY, PRESETS, computeDateRange, type DateRangeValue } from '@/components/ui/date-range-filter';

interface Economics {
  from: string;
  to: string;
  orders: number;
  revenue: number;
  avgTicket: number;
  openCount: number;
  openValue: number;
}

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function EcommerceSalesWidget({ titleKey }: { titleKey: string }) {
  const t = useTranslations('home');
  const tRange = useTranslations('dateRange');
  const [range, setRange] = useState<DateRangeValue>(() => computeDateRange('30d'));
  const [data, setData] = useState<Economics | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAnyStore, setHasAnyStore] = useState<boolean | null>(null);

  const labels = useMemo(
    () => Object.fromEntries(PRESETS.map((p) => [p, tRange(PRESET_LABEL_KEY[p])])) as Record<(typeof PRESETS)[number], string>,
    [tRange],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiFetch<Economics>(`/reports/economics?from=${range.from}&to=${range.to}&source=automated`),
      // Solo hace falta comprobar si hay AL MENOS una tienda una vez, no en
      // cada cambio de rango. Requiere permiso 'settings' — quien no lo
      // tenga verá el estado vacío igualmente si no hay ventas en el rango
      // (degradación aceptable: nunca rompe el widget, solo simplifica el
      // mensaje para un perfil que tampoco podría conectar una tienda).
      hasAnyStore === null
        ? apiFetch<{ id: string }[]>('/integrations/woocommerce/connections').catch(() => [])
        : Promise.resolve(null),
    ])
      .then(([econ, conns]) => {
        if (!active) return;
        setData(econ);
        if (conns !== null) setHasAnyStore(conns.length > 0);
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const oppsHref = `/app/opportunities?preset=${range.preset}&from=${range.from}&to=${range.to}`;

  if (hasAnyStore === false) {
    return (
      <Card className="h-full">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag size={15} strokeWidth={1.75} className="text-primary-600" /> {t(titleKey)}
        </div>
        <p className="text-sm text-ink-500">{t('ecommerceEmpty')}</p>
        <Link href="/app/settings/integrations" className="mt-2 inline-block text-xs text-primary-700 hover:underline">
          {t('ecommerceEmptyCta')} →
        </Link>
      </Card>
    );
  }

  const cards = [
    { Icon: ShoppingBag, label: t('ecommerceOrders'), value: data?.orders ?? 0 },
    { Icon: Receipt, label: t('ecommerceRevenue'), value: data ? eur.format(data.revenue) : '—' },
    { Icon: TrendingUp, label: t('ecommerceAvgTicket'), value: data ? eur.format(data.avgTicket) : '—' },
  ];

  return (
    <Card className="h-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag size={15} strokeWidth={1.75} className="text-primary-600" /> {t(titleKey)}
        </div>
        <DateRangeFilter value={range} onChange={setRange} labels={labels} />
      </div>
      <div className={`grid gap-3 sm:grid-cols-3 ${loading ? 'opacity-50' : ''}`}>
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-ink-100 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-500">
              <c.Icon size={13} strokeWidth={1.75} /> {c.label}
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Link href={oppsHref} className="text-xs text-primary-700 hover:underline">
          {t('ecommerceViewInOpportunities')} →
        </Link>
      </div>
    </Card>
  );
}
