import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { buttonClass } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/empty-state';
import { InboxSwitch } from '@/components/ui/inbox-kit';
import { MailWorkspace, type MailboxOption } from './mail-workspace';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('mail.title') };
}

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ conn?: string; thread?: string }>;
}) {
  const t = await getTranslations();
  const deepLink = await searchParams;
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
          title={t('mail.noMailboxes')}
          description={t('mail.noMailboxesBody')}
          cta={
            <Link href="/app/mail/ajustes" className={buttonClass('primary', 'text-xs')}>
              {t('mail.connectMailbox')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <MailWorkspace
      connections={conns}
      mailUnread={mail.unread}
      imPending={convCount.pending}
      initialConnectionId={deepLink.conn}
      initialThreadId={deepLink.thread}
    />
  );
}
