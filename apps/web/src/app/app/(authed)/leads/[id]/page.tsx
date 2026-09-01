import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { LeadCard, type LeadCardData } from '@/components/lead/lead-card';
import type { TimelineEvent } from '@/components/lead/lead-timeline';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('titles.lead') };
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
    <div className="space-y-4">
      <Link href="/app/contacts" className="text-sm text-ink-500 hover:text-ink-900">
        ← Volver a contactos
      </Link>
      <LeadCard lead={lead} definitions={customFieldDefs} timeline={timeline} />
    </div>
  );
}
