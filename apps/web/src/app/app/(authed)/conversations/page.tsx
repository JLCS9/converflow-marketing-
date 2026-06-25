import { serverApiFetch } from '@/lib/server-api';
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

  return <Inbox initial={initial} mailUnread={mail.unread} imPending={convCount.pending} />;
}
