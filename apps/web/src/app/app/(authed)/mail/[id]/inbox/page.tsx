import { notFound } from 'next/navigation';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { MailInbox } from './mail-inbox';

export const metadata = { title: 'Bandeja de correo' };

export default async function MailInboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conn = await serverApiFetch<{ id: string; fromAddress: string }>(
    `/mail/connections/${id}`,
  ).catch(() => null);
  if (!conn) notFound();

  return (
    <div className="space-y-4">
      <PageHeader title="Bandeja" description={conn.fromAddress} back={{ href: '/app/mail', label: 'Buzones' }} />
      <MailInbox connectionId={conn.id} fromAddress={conn.fromAddress} />
    </div>
  );
}
