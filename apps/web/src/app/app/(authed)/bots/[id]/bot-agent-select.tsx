'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

interface AgentOption {
  id: string;
  name: string;
  status: string;
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
        <option value="">— Sin agente —</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.status !== 'PUBLISHED' ? ` (${a.status.toLowerCase()})` : ''}
          </option>
        ))}
      </select>
      {saving && <span className="text-xs text-ink-500">Guardando…</span>}
    </div>
  );
}
