import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { getLabelMaps } from '@/lib/get-labels';
import { Card, Badge, StatCard } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { CampaignForm, type CampaignData } from '../campaign-form';
import { CampaignActions } from './campaign-actions';

interface Recipient {
  id: string;
  name: string | null;
  address: string;
  status: string;
  error: string | null;
  sentAt: string | null;
  openedAt: string | null;
  openCount: number;
}
interface CampaignDetail extends CampaignData {
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  completedAt: string | null;
  recipients: Recipient[];
}

const STATUS_KEY: Record<string, string> = {
  DRAFT: 'statusDraft',
  SCHEDULED: 'statusScheduled',
  SENDING: 'statusSending',
  SENT: 'statusSent',
  CANCELLED: 'statusCancelled',
  FAILED: 'statusFailed',
};
type BadgeColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow';
const STATUS_COLOR: Record<string, BadgeColor> = {
  DRAFT: 'gray',
  SCHEDULED: 'blue',
  SENDING: 'yellow',
  SENT: 'green',
  CANCELLED: 'gray',
  FAILED: 'red',
};
const REC_COLOR: Record<string, BadgeColor> = {
  PENDING: 'gray',
  SENT: 'green',
  FAILED: 'red',
  SKIPPED: 'yellow',
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations('campaigns');
  const { CHANNEL } = await getLabelMaps();
  const { id } = await params;
  const c = await serverApiFetch<CampaignDetail>(`/campaigns/${id}`).catch(() => null);
  if (!c) notFound();

  const editable = c.status === 'DRAFT' || c.status === 'SCHEDULED';

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        description={
          <span className="inline-flex items-center gap-2">
            <Badge color={STATUS_COLOR[c.status] ?? 'gray'}>
              {STATUS_KEY[c.status] ? t(STATUS_KEY[c.status]!) : c.status}
            </Badge>
            <span className="text-ink-500">{CHANNEL[c.channel] ?? c.channel}</span>
          </span>
        }
        back={{ href: '/app/campaigns', label: t('title') }}
        action={<CampaignActions id={c.id} status={c.status} />}
      />

      {editable ? (
        <CampaignForm campaign={c} />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-4">
            <StatCard label={t('statRecipients')} value={c.totalRecipients} />
            <StatCard label={t('statSent')} value={c.sentCount} />
            <StatCard label={t('statOpens')} value={c.recipients.filter((r) => r.openedAt).length} />
            <StatCard label={t('statFailed')} value={c.failedCount} />
          </section>

          <Card>
            <h3 className="mb-3 text-sm font-mono uppercase tracking-wider text-ink-500">
              {t('message')}
            </h3>
            {c.subject && <div className="mb-1 text-sm font-medium">{c.subject}</div>}
            <pre className="whitespace-pre-wrap font-sans text-sm text-ink-700">{c.body}</pre>
          </Card>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-4 py-3">{t('colRecipient')}</th>
                  <th className="px-4 py-3">{t('colAddress')}</th>
                  <th className="px-4 py-3">{t('colStatus')}</th>
                  <th className="px-4 py-3">{t('colOpened')}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t('colDetail')}</th>
                </tr>
              </thead>
              <tbody>
                {c.recipients.map((r) => (
                  <tr key={r.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-2">{r.name ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.address}</td>
                    <td className="px-4 py-2">
                      <Badge color={REC_COLOR[r.status] ?? 'gray'}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.openedAt ? (
                        <span className="text-green-700" title={new Date(r.openedAt).toLocaleString('es-ES')}>
                          ✓{r.openCount > 1 ? ` ×${r.openCount}` : ''}
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-2 text-xs text-ink-500 md:table-cell">
                      {r.error
                        ? r.error
                        : r.sentAt
                          ? new Date(r.sentAt).toLocaleString('es-ES')
                          : '—'}
                    </td>
                  </tr>
                ))}
                {c.recipients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-500">
                      {t('noRecipients')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
