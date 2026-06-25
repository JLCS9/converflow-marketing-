import Link from 'next/link';
import { Settings } from 'lucide-react';
import { serverApiFetch } from '@/lib/server-api';
import { buttonClass } from '@/components/ui/primitives';
import { TabBar } from '@/components/ui/tab-bar';
import { Inbox } from './inbox';

const MAIL_TABS = [
  { href: '/app/conversations', label: 'Mensajería' },
  { href: '/app/mail', label: 'Correo' },
];

interface ConvRow {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  contactJid: string;
  channel: string;
  status: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  lead: { id: string; name: string; score: number | null } | null;
}

export const metadata = { title: 'Conversaciones' };

const settingsAction = (
  <Link
    href="/app/bots"
    className={buttonClass('ghost', 'gap-1.5 px-2 py-1 text-xs')}
    title="Canales conectados (WhatsApp, Web Chat)"
  >
    <Settings size={14} strokeWidth={1.75} aria-hidden /> Canales
  </Link>
);

export default async function ConversationsPage() {
  const initial = await serverApiFetch<ConvRow[]>('/conversations?status=PENDING');

  return (
    <div className="space-y-3">
      <TabBar items={MAIL_TABS} action={settingsAction} />
      <Inbox initial={initial} />
    </div>
  );
}
