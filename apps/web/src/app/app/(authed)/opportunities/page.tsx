import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { buttonClass } from '@/components/ui/primitives';
import { TabBar, CRM_TABS } from '@/components/ui/tab-bar';
import { computeDateRange, type DateRangePreset } from '@/components/ui/date-range-filter';
import { OpportunitiesBoard } from './opportunities-board';
import { OpportunitiesDateFilter } from './opportunities-date-filter';
import type { OppCard, Pipeline } from './types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('titles.opportunities') };
}
export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ pipelineId?: string; preset?: string; from?: string; to?: string }>;
}) {
  const t = await getTranslations();
  const params = await searchParams;
  const pipelines = await serverApiFetch<Pipeline[]>('/pipelines').catch(() => []);
  const selected =
    pipelines.find((p) => p.id === params.pipelineId) ??
    pipelines.find((p) => p.isDefault) ??
    pipelines[0];

  // Bloque de Inteligencia de Negocio: por defecto últimos 30 días — igual
  // que el widget de ventas del inicio, mismo criterio en toda la app.
  const range = computeDateRange(
    (params.preset as DateRangePreset) || '30d',
    { from: params.from, to: params.to },
  );

  const opps = selected
    ? await serverApiFetch<OppCard[]>(
        `/opportunities?pipelineId=${selected.id}&limit=500&from=${range.from}&to=${range.to}`,
      )
    : [];

  return (
    <div className="space-y-6">
      <TabBar items={CRM_TABS} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('opportunities.title')}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {opps.length} oportunidades · arrastra las tarjetas entre columnas para cambiar de etapa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pipelines.length > 1 && (
            <form className="flex items-center gap-2">
              <label className="text-xs text-ink-500">{t('opportunities.board')}</label>
              <select
                name="pipelineId"
                defaultValue={selected?.id ?? ''}
                className="rounded-md border-ink-300 text-sm"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isDefault ? ' · por defecto' : ''}
                  </option>
                ))}
              </select>
              <button type="submit" className={buttonClass('secondary', 'text-xs px-3 py-1.5')}>
                Cambiar
              </button>
            </form>
          )}
          <Link href="/app/settings/pipelines" className="text-xs text-primary-700 hover:underline">
            Gestionar tableros
          </Link>
          <Link href="/app/opportunities/new" className={buttonClass('primary')}>
            + Nueva
          </Link>
        </div>
      </header>

      <OpportunitiesDateFilter value={range} />

      {!selected ? (
        <div className="rounded-md border border-dashed border-ink-200 p-6 text-sm text-ink-500">
          No hay tableros configurados.{' '}
          <Link href="/app/settings/pipelines" className="text-primary-700 hover:underline">
            Crear el primero
          </Link>
          .
        </div>
      ) : (
        <OpportunitiesBoard pipeline={selected} initialOpps={opps} />
      )}
    </div>
  );
}
