import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { CampaignForm } from '../campaign-form';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('campaigns.newTitle') };
}

export default async function NewCampaignPage() {
  const t = await getTranslations('campaigns');
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('newTitle')}
        description={t('newDescription')}
        back={{ href: '/app/campaigns', label: t('title') }}
      />
      <CampaignForm />
    </div>
  );
}
