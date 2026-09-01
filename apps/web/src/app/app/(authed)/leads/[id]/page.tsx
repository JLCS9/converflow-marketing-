import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { Card, Badge } from '@/components/ui/primitives';
import { LeadActions } from './lead-actions';
import { MeetingScheduler } from '@/components/meeting-scheduler';
import { LeadCard, type LeadCardData } from '@/components/lead/lead-card';
import type { TimelineEvent } from '@/components/lead/lead-timeline';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';
import { LEAD_STATUS, LEAD_STATUS_COLOR, statusColor, statusLabel } from '@/lib/labels';

export const metadata = { title: 'Lead' };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations();
  const { id } = await params;
  let lead: LeadCardData;
  try {
    lead = await serverApiFetch<LeadCardData>(`/leads/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const [customFieldDefs, timeline] = await Promise.all([
    serverApiFetch<CustomFieldDefinition[]>('/custom-fields?entityType=LEAD').catch(
      () => [] as CustomFieldDefinition[],
    ),
    serverApiFetch<TimelineEvent[]>(`/leads/${id}/timeline`).catch(() => [] as TimelineEvent[]),
  ]);

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
        </div>
      </div>

      {/* Tarjeta canónica: información · comentarios · actividad */}
      <LeadCard lead={lead} definitions={customFieldDefs} timeline={timeline} />

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('leadDetail.aiMeetings')}</h2>
        <p className="mt-1 text-xs text-ink-500">
          La IA consulta tu disponibilidad en Google Calendar y propone los mejores huecos. Al
          agendar, crea el evento (invitando al lead) y una tarea de seguimiento.
        </p>
        <div className="mt-4">
          <MeetingScheduler leadId={lead.id} />
        </div>
      </Card>

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
    </div>
  );
}
