export interface PlaybookRow {
  id: string;
  name: string;
  active: boolean;
  trigger: { on: 'transition' | 'event'; toState?: string; eventType?: string };
  action: { kind: 'followup'; instructions: string };
  mode: 'DRAFT_APPROVE' | 'AUTO';
  guardrails: {
    maxPerContactDays?: number;
    requireConsent?: boolean;
    quietStartHour?: number;
    quietEndHour?: number;
  } | null;
  createdAt: string;
}

export interface RunRow {
  id: string;
  playbookId: string;
  playbook?: { name: string };
  profileId: string | null;
  leadId: string | null;
  conversationId: string | null;
  status: 'DRAFT' | 'APPROVED' | 'SENT' | 'REJECTED' | 'SUPPRESSED' | 'FAILED';
  draftText: string | null;
  sentText: string | null;
  reason: string | null;
  reviewedBy: string | null;
  sentAt: string | null;
  createdAt: string;
}

export type PlaybookStats = Record<
  string,
  { sent: number; replied: number; noReply: number; suppressed: number; rejected: number; replyRate: number | null }
>;
