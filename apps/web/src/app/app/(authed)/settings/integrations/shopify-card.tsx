import { getTranslations } from 'next-intl/server';
import { ShoppingBag } from 'lucide-react';
import { Card } from '@/components/ui/primitives';

/**
 * Shopify «Próximamente» — mismo patrón que las plantillas no disponibles
 * del asistente (agents/new/purpose-wizard.tsx): tarjeta deshabilitada con
 * tooltip, sin lógica detrás. Icono lucide + color, no logo de marca (el
 * producto no usa SVGs de marca en ningún sitio). Server component: sin
 * interactividad, no necesita 'use client'.
 */
export async function ShopifyCard() {
  const t = await getTranslations('settings.integrations');
  return (
    <div aria-disabled title={t('comingSoonTooltip')} className="cursor-not-allowed">
      <Card className="opacity-60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-mono uppercase tracking-wider text-ink-500">
              <ShoppingBag size={14} /> {t('shopify.title')}
            </h2>
            <p className="mt-1 text-xs text-ink-500">{t('shopify.description')}</p>
          </div>
          <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">
            {t('comingSoon')}
          </span>
        </div>
      </Card>
    </div>
  );
}
