import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { getLabelMaps } from '@/lib/get-labels';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  status: string;
  scheduledAt: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
}

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('campaigns.title') };
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

export default async function CampaignsPage() {
  const t = await getTranslations('campaigns');
  const { CHANNEL } = await getLabelMaps();
  const campaigns = await serverApiFetch<CampaignRow[]>('/campaigns').catch(() => [] as CampaignRow[]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <Link href="/app/campaigns/new" className={buttonClass('primary')}>
            {t('newCampaign')}
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          cta={
            <Link href="/app/campaigns/new" className={buttonClass('primary', 'text-xs')}>
              {t('newCampaign')}
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">{t('colCampaign')}</th>
                <th className="px-4 py-3">{t('colChannel')}</th>
                <th className="px-4 py-3">{t('colStatus')}</th>
                <th className="px-4 py-3">{t('colRecipients')}</th>
                <th className="hidden px-4 py-3 md:table-cell">{t('colScheduled')}</th>
                <th className="px-4 py-3 text-right">—</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-xs">{CHANNEL[c.channel] ?? c.channel}</td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLOR[c.status] ?? 'gray'}>
                      {STATUS_KEY[c.status] ? t(STATUS_KEY[c.status]!) : c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.status === 'DRAFT'
                      ? '—'
                      : `${c.sentCount}/${c.totalRecipients}${
                          c.failedCount ? ` · ${t('failedCount', { count: c.failedCount })}` : ''
                        }`}
                  </td>
                  <td className="hidden px-4 py-3 text-xs md:table-cell">
                    {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString('es-ES') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/app/campaigns/${c.id}`}
                      className="text-xs text-primary-700 hover:underline"
                    >
                      {t('open')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
