import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
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
  const initial = await serverApiFetch<ConvRow[]>('/conversations?status=PENDING');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conversaciones"
        description="Mensajería instantánea: WhatsApp y Web Chat. El correo vive en su propia sección «Correo». Las marcadas sin responder esperan tu contestación."
      />
      <Inbox initial={initial} />
    </div>
  );
}
