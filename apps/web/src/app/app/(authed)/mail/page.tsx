import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { buttonClass } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/empty-state';
import { InboxSwitch } from '@/components/ui/inbox-kit';
import { MailWorkspace, type MailboxOption } from './mail-workspace';

export const metadata = { title: 'Correo' };

export default async function MailPage() {
  const [conns, convCount, mail] = await Promise.all([
    serverApiFetch<MailboxOption[]>('/mail/connections').catch(() => [] as MailboxOption[]),
    serverApiFetch<{ pending: number }>('/conversations/count').catch(() => ({ pending: 0 })),
    serverApiFetch<{ unread: number }>('/mail/unread-count').catch(() => ({ unread: 0 })),
  ]);

  if (conns.length === 0) {
    return (
      <div className="space-y-3">
        <InboxSwitch active="mail" mailCount={mail.unread} imCount={convCount.pending} />
        <EmptyState
          title="Sin buzones conectados"
          description="Conecta tu primer buzón (Gmail, Outlook, IONOS o cualquier IMAP/SMTP) para enviar y recibir correo desde Converflow."
          cta={
            <Link href="/app/mail/ajustes" className={buttonClass('primary', 'text-xs')}>
              + Conectar buzón
            </Link>
          }
        />
      </div>
    );
  }

  return <MailWorkspace connections={conns} mailUnread={mail.unread} imPending={convCount.pending} />;
}
