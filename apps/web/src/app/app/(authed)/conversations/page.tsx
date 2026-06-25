import { serverApiFetch } from '@/lib/server-api';
import { TabBar } from '@/components/ui/tab-bar';
import { Inbox } from './inbox';

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

export default async function ConversationsPage() {
  const [initial, convCount, mail] = await Promise.all([
    serverApiFetch<ConvRow[]>('/conversations?status=PENDING'),
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
      <Inbox initial={initial} />
    </div>
  );
}
