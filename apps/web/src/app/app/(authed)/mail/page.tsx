import Link from 'next/link';
import { Settings } from 'lucide-react';
import { serverApiFetch } from '@/lib/server-api';
import { buttonClass } from '@/components/ui/primitives';
import { TabBar } from '@/components/ui/tab-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { MailWorkspace, type MailboxOption } from './mail-workspace';

const MAIL_TABS = [
  { href: '/app/mail', label: 'Correo' },
  { href: '/app/conversations', label: 'Mensajería' },
];

export const metadata = { title: 'Correo' };

const settingsAction = (
  <Link
    href="/app/mail/ajustes"
    className={buttonClass('ghost', 'gap-1.5 px-2 py-1 text-xs')}
    title="Buzones y plantillas"
  >
    <Settings size={14} strokeWidth={1.75} aria-hidden /> Ajustes
  </Link>
);

export default async function MailPage() {
  const conns = await serverApiFetch<MailboxOption[]>('/mail/connections').catch(
    () => [] as MailboxOption[],
  );

  return (
    <div className="space-y-3">
      <TabBar items={MAIL_TABS} action={settingsAction} />
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
