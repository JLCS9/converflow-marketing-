'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useLabelMaps } from '@/lib/use-labels';

interface AgentOption {
  id: string;
  name: string;
  status: string;
  type?: 'CONVERSATIONAL' | 'SCORING' | 'TRIAGE';
}

export function BotAgentSelect({
  botId,
  currentAgentId,
  agents,
}: {
  botId: string;
  currentAgentId: string | null;
  agents: AgentOption[];
}) {
  const t = useTranslations('bots');
  const { AGENT_STATUS } = useLabelMaps();
  // Only conversational agents make sense as the bot's responder. Scoring /
  // Triage agents are invoked elsewhere (Leads → Score IA, future triage).
  const conversational = agents.filter(
    (a) => (a.type ?? 'CONVERSATIONAL') === 'CONVERSATIONAL',
  );
  const router = useRouter();
  const [value, setValue] = useState(currentAgentId ?? '');
  const [saving, setSaving] = useState(false);

  async function save(next: string) {
    setValue(next);
    setSaving(true);
    try {
      await apiFetch(`/bots/${botId}`, { method: 'PATCH', json: { agentId: next || null } });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <select
        value={value}
        disabled={saving}
        onChange={(e) => void save(e.target.value)}
        className="rounded-md border-ink-300 text-sm focus:border-primary-500 focus:ring-primary-500"
      >
        <option value="">{t('noAgentOption')}</option>
        {conversational.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.status !== 'PUBLISHED'
              ? ` (${(AGENT_STATUS[a.status] ?? a.status).toLowerCase()})`
              : ''}
          </option>
        ))}
      </select>
      {saving && <span className="text-xs text-ink-500">{t('saving')}</span>}
    </div>
  );
}
