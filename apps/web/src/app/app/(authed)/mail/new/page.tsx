import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { MailConnectionForm } from '../mail-connection-form';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('mailboxes.newTitle') };
}

export default async function NewMailConnectionPage() {
  const t = await getTranslations('mailboxes');
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('newTitle')}
        description={t('newDescription')}
        back={{ href: '/app/mail/ajustes', label: t('backToMailboxes') }}
      />
      <MailConnectionForm />
    </div>
  );
}
