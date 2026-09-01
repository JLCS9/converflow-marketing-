import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { Card, Badge } from '@/components/ui/primitives';
import { OpportunityEdit } from './opportunity-edit';
import { OpportunityNotes } from './opportunity-notes';
import { OpportunityDelete } from './opportunity-delete';
import { CustomFieldsCard } from '@/components/custom-fields/card';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';
import { LEAD_STATUS_COLOR, statusColor, statusLabel } from '@/lib/labels';
import { getLabelMaps } from '@/lib/get-labels';

interface Note {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
}

interface DocumentRow {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface StageHistoryRow {
  id: string;
  stageId: string;
  movedAt: string;
  stage: { id: string; label: string; color: string };
}

interface PipelineStage {
  id: string;
  key: string;
  label: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

interface OppDetail {
  id: string;
  name: string;
  amount: string | null;
  currency: string;
  status: string;
  probability: number;
  expectedCloseDate: string | null;
  closedAt: string | null;
  ownerId: string | null;
  proposalUrl: string | null;
  createdAt: string;
  updatedAt: string;
  customFields: Record<string, unknown> | null;
  stageId: string | null;
  pipelineId: string | null;
  stage: PipelineStage | null;
  pipeline: { id: string; name: string; stages: PipelineStage[] } | null;
  lead: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: string | null;
    status: string;
    score: number | null;
    customFields: Record<string, unknown> | null;
  } | null;
  client: { id: string; name: string; email: string | null } | null;
  tasks: Task[];
  documents: DocumentRow[];
  notes: Note[];
  stageHistory: StageHistoryRow[];
}

export const metadata = { title: 'Oportunidad' };
export const dynamic = 'force-dynamic';

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { LEAD_STATUS } = await getLabelMaps();
  const t = await getTranslations();
  const { id } = await params;
  let opp: OppDetail;
  try {
    opp = await serverApiFetch<OppDetail>(`/opportunities/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const oppFields = await serverApiFetch<CustomFieldDefinition[]>(
    '/custom-fields?entityType=OPPORTUNITY',
  ).catch(() => [] as CustomFieldDefinition[]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/opportunities" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver al tablero
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{opp.name}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm">
              {opp.stage ? (
                <span
                  className="rounded px-2 py-0.5 text-[11px] font-medium text-white"
                  style={{ backgroundColor: opp.stage.color }}
                >
                  {opp.stage.label}
                </span>
              ) : (
                <Badge color="gray">{opp.status}</Badge>
              )}
              {opp.amount && (
                <span className="font-mono text-xs">
                  {Number(opp.amount).toLocaleString('es-ES')} {opp.currency}
                </span>
              )}
              <span className="font-mono text-xs text-ink-500">{opp.probability}% prob</span>
              {opp.pipeline && (
                <span className="text-xs text-ink-500">{opp.pipeline.name}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <OpportunityEdit
          opp={{
            id: opp.id,
            name: opp.name,
            amount: opp.amount,
            currency: opp.currency,
            probability: opp.probability,
            expectedCloseDate: opp.expectedCloseDate,
            proposalUrl: opp.proposalUrl,
            stageId: opp.stageId,
            pipelineId: opp.pipelineId,
          }}
          pipeline={opp.pipeline}
        />

        <Card className="lg:col-span-2">
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Lead</h2>
          {opp.lead ? (
            // Ficha reducida (Bloque 3): la tarjeta canónica vive en /app/leads/[id].
            // Aquí solo enlace + chips, sin duplicar información editable.
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <Link
                href={`/app/leads/${opp.lead.id}`}
                className="text-base font-medium text-primary-700 hover:underline"
              >
                {opp.lead.name} →
              </Link>
              <Badge color={statusColor(LEAD_STATUS_COLOR, opp.lead.status)}>
                {statusLabel(LEAD_STATUS, opp.lead.status)}
              </Badge>
              {opp.lead.score != null && (
                <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-ink-700">
                  {t('leadDetail.aiScore')} {opp.lead.score}
                </span>
              )}
              {opp.lead.company && (
                <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-xs text-ink-700">
                  {opp.lead.company}
                </span>
              )}
              {opp.lead.email && (
                <a
                  className="rounded-md bg-ink-100 px-1.5 py-0.5 text-xs text-primary-700 hover:underline"
                  href={`mailto:${opp.lead.email}`}
                >
                  {opp.lead.email}
                </a>
              )}
            </div>
          ) : opp.client ? (
            <div className="mt-4 text-sm">
              <Link
                href={`/app/clients/${opp.client.id}`}
                className="text-base font-medium text-primary-700 hover:underline"
              >
                {opp.client.name}
              </Link>
              {opp.client.email && (
                <p className="text-ink-500">{opp.client.email}</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">{t('detail.noLinkedContact')}</p>
          )}
        </Card>
      </div>

      <CustomFieldsCard
        entityType="OPPORTUNITY"
        apiBase={`/opportunities/${opp.id}`}
        definitions={oppFields}
        values={opp.customFields}
      />

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('detail.notes')}</h2>
        <p className="mt-1 text-xs text-ink-500">
          Apunta el avance de la oportunidad, próximos pasos o blockers.
        </p>
        <div className="mt-4">
          <OpportunityNotes opportunityId={opp.id} initial={opp.notes} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('detail.stageHistory')}</h2>
          {opp.stageHistory.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">{t('detail.noStageChanges')}</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {opp.stageHistory.map((h) => (
                <li key={h.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: h.stage.color }}
                    />
                    {h.stage.label}
                  </span>
                  <span className="text-xs text-ink-500">
                    {new Date(h.movedAt).toLocaleString('es-ES')}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('detail.tasks')}</h2>
          {opp.tasks.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">{t('detail.noTasks')}</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {opp.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <span>{t.title}</span>
                  <span className="text-xs text-ink-500">
                    {t.status}
                    {t.dueAt ? ` · ${new Date(t.dueAt).toLocaleDateString('es-ES')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('detail.documents')}</h2>
        {opp.documents.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">{t('detail.noDocuments')}</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {opp.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <span>📎 {d.name}</span>
                <span className="text-xs text-ink-500">
                  {Math.round(d.sizeBytes / 1024)} KB ·{' '}
                  {new Date(d.createdAt).toLocaleDateString('es-ES')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex justify-end">
        <OpportunityDelete opportunityId={opp.id} />
      </div>
    </div>
  );
}

