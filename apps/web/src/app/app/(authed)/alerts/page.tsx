import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { AlertItem, MarkAllReadButton, type Alert } from './alert-item';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('alerts.title') };
}

export default async function AlertsPage() {
  const t = await getTranslations('alerts');
  const alerts = await serverApiFetch<Alert[]>('/alerts');
  const unread = alerts.filter((a) => !a.readAt).length;
  const critical = alerts.filter((a) => a.severity === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={unread > 0 ? <MarkAllReadButton /> : undefined}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('active')}
          </div>
          <div className="mt-1 text-2xl font-semibold">{alerts.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('unread')}
          </div>
          <div className="mt-1 text-2xl font-semibold">{unread}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
            {t('critical')}
          </div>
          <div className={`mt-1 text-2xl font-semibold ${critical > 0 ? 'text-red-600' : ''}`}>
            {critical}
          </div>
        </Card>
      </section>

      {alerts.length === 0 ? (
        <EmptyState
          tone="positive"
          icon={<span className="text-base">✓</span>}
          title={t('allClearTitle')}
          description={
            <>
              {t('allClearIntro')}
              <ul className="mx-auto mt-2 max-w-md list-disc text-left text-xs text-ink-500 sm:mt-3">
                <li>{t('allClearItem1')}</li>
                <li>{t('allClearItem2')}</li>
                <li>{t('allClearItem3')}</li>
                <li>{t('allClearItem4')}</li>
              </ul>
            </>
          }
        />
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <AlertItem key={a.id} alert={a} />
          ))}
        </ul>
      )}
    </div>
  );
}
