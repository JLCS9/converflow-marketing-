import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { WoocommerceCard, type WoocommerceConnection } from './woocommerce-card';
import { ShopifyCard } from './shopify-card';

export async function generateMetadata() {
  const t = await getTranslations('settings.integrations');
  return { title: t('title') };
}

export default async function IntegrationsSettingsPage() {
  const t = await getTranslations('settings.integrations');
  const connections = await serverApiFetch<WoocommerceConnection[]>(
    '/integrations/woocommerce/connections',
  ).catch(() => [] as WoocommerceConnection[]);

  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumbs={[
          { href: '/app/settings', label: t('breadcrumbSettings') },
          { label: t('title') },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <WoocommerceCard initialConnections={connections} />
        <ShopifyCard />
      </div>
    </div>
  );
}
