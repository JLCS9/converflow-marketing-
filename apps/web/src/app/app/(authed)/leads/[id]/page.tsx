import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { Card, Badge } from '@/components/ui/primitives';
import { LeadActions } from './lead-actions';
import { ScoreLeadButton } from './score-button';
import { NotesSection } from './notes-section';
import { MeetingScheduler } from '@/components/meeting-scheduler';
import { LeadInfoCard } from './lead-info-card';
import { CustomFieldsCard } from './custom-fields-card';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

interface NoteWithAi {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
  aiCategory: string | null;
  aiSentiment: string | null;
  aiConfidence: number | null;
  aiSuggestedReply: string | null;
  aiAnalyzedAt: string | null;
}

interface LeadDetail {
  id: string;
  name: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: string;
  score: number | null;
  ownerId: string | null;
  contactedAt: string | null;
  qualifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customFields: Record<string, unknown> | null;
  aiScoreReasoning: string | null;
  aiScoreActions: string[] | null;
  aiScoredAt: string | null;
  client: { id: string; name: string } | null;
  opportunities: Array<{ id: string; name: string; status: string; amount: string | null }>;
  tasks: Array<{ id: string; title: string; status: string; dueAt: string | null }>;
  notes: NoteWithAi[];
}

import { LEAD_STATUS, LEAD_STATUS_COLOR, statusColor, statusLabel } from '@/lib/labels';

function scoreColor(score: number | null): string {
  if (score == null) return 'bg-ink-100 text-ink-500';
  if (score >= 75) return 'bg-green-100 text-green-800';
  if (score >= 50) return 'bg-yellow-100 text-yellow-800';
  if (score >= 25) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

export const metadata = { title: 'Lead' };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let lead: LeadDetail;
  try {
    lead = await serverApiFetch<LeadDetail>(`/leads/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const customFieldDefs = await serverApiFetch<CustomFieldDefinition[]>(
    '/custom-fields?entityType=LEAD',
  ).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/leads" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a leads
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {lead.name}
              {lead.lastName && <span className="ml-2 font-normal text-ink-700">{lead.lastName}</span>}
            </h1>
            <div className="mt-1 flex items-center gap-3 text-sm">
              <Badge color={statusColor(LEAD_STATUS_COLOR, lead.status)}>
                {statusLabel(LEAD_STATUS, lead.status)}
              </Badge>
              {lead.company && <span className="text-ink-700">{lead.company}</span>}
              {lead.source && (
                <span className="font-mono text-xs text-ink-500">fuente: {lead.source}</span>
              )}
            </div>
          </div>
          <div className={`rounded-lg px-4 py-3 ${scoreColor(lead.score)}`}>
            <div className="text-xs font-mono uppercase tracking-wider">Score IA</div>
            <div className="text-3xl font-semibold tabular-nums">
              {lead.score != null ? lead.score : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <LeadInfoCard lead={lead} />

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
              Análisis IA
            </h2>
            {lead.aiScoredAt && (
              <span className="text-xs text-ink-500">
                Última: {new Date(lead.aiScoredAt).toLocaleString('es-ES')}
              </span>
            )}
          </div>
          {lead.aiScoreReasoning ? (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-ink-700">{lead.aiScoreReasoning}</p>
              {lead.aiScoreActions && lead.aiScoreActions.length > 0 && (
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
                    Acciones recomendadas
                  </div>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-ink-700">
                    {lead.aiScoreActions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">
              Sin análisis IA todavía. Pulsa el botón para calcular el score con Claude.
            </p>
          )}
          <div className="mt-4">
            <ScoreLeadButton leadId={lead.id} hasScore={lead.score != null} />
          </div>
        </Card>
      </div>

      <CustomFieldsCard
        entityType="LEAD"
        apiBase={`/leads/${lead.id}`}
        definitions={customFieldDefs}
        values={lead.customFields}
      />

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          Notas y mensajes
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Apunta interacciones o pega mensajes recibidos. Claude los clasificará y propondrá
          respuesta lista para enviar.
        </p>
        <div className="mt-4">
          <NotesSection leadId={lead.id} initial={lead.notes} />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Reuniones IA</h2>
        <p className="mt-1 text-xs text-ink-500">
          La IA consulta tu disponibilidad en Google Calendar y propone los mejores huecos. Al
          agendar, crea el evento (invitando al lead) y una tarea de seguimiento.
        </p>
        <div className="mt-4">
          <MeetingScheduler leadId={lead.id} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Estado</h2>
          <p className="mt-1 text-xs text-ink-500">
            Cambia el estado o elimina el lead. Las transiciones quedan registradas.
          </p>
          <div className="mt-4">
            <LeadActions
              leadId={lead.id}
              leadName={[lead.name, lead.lastName].filter(Boolean).join(' ').trim() || undefined}
              currentStatus={lead.status as never}
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
              Oportunidades vinculadas
            </h2>
            <Link
              href={`/app/opportunities/new?leadId=${lead.id}`}
              className="text-xs text-primary-700 hover:underline"
            >
              + Nueva oportunidad
            </Link>
          </div>
          {lead.opportunities.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">Sin oportunidades todavía.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {lead.opportunities.map((o) => (
                <li key={o.id} className="flex justify-between gap-3">
                  <Link href={`/app/opportunities/${o.id}`} className="text-primary-700 hover:underline">
                    {o.name}
                  </Link>
                  <span className="text-xs text-ink-500">{o.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

