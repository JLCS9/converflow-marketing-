import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { MailConnectionForm, type MailConnectionData } from '../mail-connection-form';

export default async function EditMailConnectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations('mailboxes');
  const { id } = await params;
  const conn = await serverApiFetch<MailConnectionData>(`/mail/connections/${id}`).catch(() => null);
  if (!conn) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('editTitle')}
        description={t('editDescription')}
        back={{ href: '/app/mail/ajustes', label: t('backToMailboxes') }}
      />
      <MailConnectionForm connection={conn} />
    </div>
  );
}
