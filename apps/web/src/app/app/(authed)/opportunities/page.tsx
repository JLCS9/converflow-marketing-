import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { buttonClass } from '@/components/ui/primitives';
import { OpportunitiesBoard } from './opportunities-board';
import type { OppCard, Pipeline } from './types';

export const metadata = { title: 'Oportunidades' };
export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ pipelineId?: string }>;
}) {
  const params = await searchParams;
  const pipelines = await serverApiFetch<Pipeline[]>('/pipelines').catch(() => []);
  const selected =
    pipelines.find((p) => p.id === params.pipelineId) ??
    pipelines.find((p) => p.isDefault) ??
    pipelines[0];
  const opps = selected
    ? await serverApiFetch<OppCard[]>(`/opportunities?pipelineId=${selected.id}&limit=500`)
    : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Oportunidades</h1>
          <p className="mt-1 text-sm text-ink-500">
            {opps.length} oportunidades · arrastra las tarjetas entre columnas para cambiar de etapa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pipelines.length > 1 && (
            <form className="flex items-center gap-2">
              <label className="text-xs text-ink-500">Tablero</label>
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
