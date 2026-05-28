import { serverApiFetch } from '@/lib/server-api';
import { Inbox } from './inbox';

interface ConvRow {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  contactJid: string;
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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Conversaciones</h1>
        <p className="mt-1 text-sm text-ink-500">
          Bandeja de WhatsApp. Las que están <strong>sin responder</strong> esperan tu contestación;
          al responder desde tu WhatsApp se marcan como respondidas automáticamente.
        </p>
      </header>
      <Inbox initial={initial} />
    </div>
  );
}
