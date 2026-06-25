import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
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

export default async function ConversationsPage() {
  const initial = await serverApiFetch<ConvRow[]>('/conversations?status=PENDING');

  return (
    <div className="space-y-4">
      <TabBar items={MAIL_TABS} />
      <PageHeader
        title="Conversaciones"
        description="Mensajería instantánea: WhatsApp y Web Chat. El correo vive en su propia sección «Correo». Las marcadas sin responder esperan tu contestación."
      />
      <Inbox initial={initial} />
    </div>
  );
}
