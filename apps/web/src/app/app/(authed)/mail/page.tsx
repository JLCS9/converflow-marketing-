import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { buttonClass } from '@/components/ui/primitives';
import { TabBar } from '@/components/ui/tab-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { MailWorkspace, type MailboxOption } from './mail-workspace';

export const metadata = { title: 'Correo' };

export default async function MailPage() {
  const [conns, convCount, mail] = await Promise.all([
    serverApiFetch<MailboxOption[]>('/mail/connections').catch(() => [] as MailboxOption[]),
    serverApiFetch<{ pending: number }>('/conversations/count').catch(() => ({ pending: 0 })),
    serverApiFetch<{ unread: number }>('/mail/unread-count').catch(() => ({ unread: 0 })),
  ]);

  const tabs = [
    { href: '/app/mail', label: 'Correo', badge: mail.unread },
    { href: '/app/conversations', label: 'Mensajería', badge: convCount.pending },
  ];

  return (
    <div className="space-y-3">
      <TabBar items={tabs} />
      {conns.length === 0 ? (
        <EmptyState
          title="Sin buzones conectados"
          description="Conecta tu primer buzón (Gmail, Outlook, IONOS o cualquier IMAP/SMTP) para enviar y recibir correo desde Converflow."
          cta={
            <Link href="/app/mail/ajustes" className={buttonClass('primary', 'text-xs')}>
              + Conectar buzón
            </Link>
          }
        />
      ) : (
        <MailWorkspace connections={conns} />
      )}
    </div>
  );
}
