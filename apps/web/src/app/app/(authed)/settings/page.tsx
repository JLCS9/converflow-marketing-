import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { GoogleCalendarCard } from './google-calendar-card';
import { AutomationCard } from './automation-card';

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  maxUsers: number;
  maxBots: number;
  maxConversationsPerMonth: number;
  maxStorageGb: number;
  kitDigitalSegment: string | null;
  contactEmail: string;
  contactPhone: string | null;
  timezone: string;
  locale: string;
  createdAt: string;
}

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
}

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('settings.title') };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const t = await getTranslations('settings');
  const { google } = await searchParams;
  const [tenant, googleStatus] = await Promise.all([
    serverApiFetch<TenantDetail>('/me/tenant'),
    serverApiFetch<GoogleStatus>('/integrations/google/status'),
  ]);

  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader
        title={t('title')}
        description={
          <>
            {t('description')}{' '}
            <a
              href="mailto:hola@converflow.ai?subject=Ampliar%20l%C3%ADmites%20del%20tenant"
              className="text-primary-700 hover:underline"
            >
              {t('writeUs')}
            </a>
            .
          </>
        }
        breadcrumbs={[
          { href: '/app/settings', label: t('breadcrumbSettings') },
          { label: t('title') },
        ]}
      />

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          {t('generalInfo')}
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('name')}>{tenant.name}</Field>
          <Field label={t('identifier')} mono>
            {tenant.slug}
          </Field>
          <Field label={t('contactEmail')}>{tenant.contactEmail}</Field>
          <Field label={t('phone')}>{tenant.contactPhone ?? '—'}</Field>
          <Field label={t('timezone')} mono>
            {tenant.timezone}
          </Field>
          <Field label={t('language')} mono>
            {tenant.locale}
          </Field>
          <Field label={t('createdAt')}>{new Date(tenant.createdAt).toLocaleString('es-ES')}</Field>
          <Field label={t('status')} mono>
            {tenant.status}
          </Field>
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          {t('planLimits')}
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('users')} mono>
            {tenant.maxUsers}
          </Field>
          <Field label={t('bots')} mono>
            {tenant.maxBots}
          </Field>
          <Field label={t('conversationsPerMonth')} mono>
            {tenant.maxConversationsPerMonth}
          </Field>
          <Field label={t('storage')} mono>
            {tenant.maxStorageGb} GB
          </Field>
        </dl>
        {tenant.kitDigitalSegment && (
          <p className="mt-4 text-xs text-ink-500">
            {t.rich('kitDigital', {
              segment: tenant.kitDigitalSegment,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        )}
      </Card>

      <AutomationCard />

      <GoogleCalendarCard status={googleStatus} flash={google} />
    </div>
  );
}

function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={`mt-1 text-sm text-ink-900 ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}
