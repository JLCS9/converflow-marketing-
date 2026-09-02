'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useFeedback } from '@/components/ui/feedback';

type Mode = 'OFF' | 'SUGGEST' | 'AUTO';

/**
 * Atención autónoma · Controles por buzón: modo del asistente (Apagada/
 * Sugiere/Responde sola — mismo lenguaje que los bots) y «Solo estas
 * personas» (acceso restringido en bandejas compartidas).
 */
export function MailboxAiMode({ connectionId, initialMode }: { connectionId: string; initialMode: Mode }) {
  const t = useTranslations('mailboxes');
  const { toast } = useFeedback();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState(false);

  async function save(next: Mode) {
    if (next === mode) return;
    const prev = mode;
    setMode(next);
    setBusy(true);
    try {
      await apiFetch(`/mail/connections/${connectionId}`, { method: 'PATCH', json: { aiReplyMode: next } });
      toast.success(t('aiModeSaved'));
    } catch (e) {
      setMode(prev);
      toast.error(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={mode}
      disabled={busy}
      onChange={(e) => void save(e.target.value as Mode)}
      className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs"
      aria-label={t('aiModeLabel')}
    >
      <option value="OFF">{t('aiModeOff')}</option>
      <option value="SUGGEST">{t('aiModeSuggest')}</option>
      <option value="AUTO">{t('aiModeAuto')}</option>
    </select>
  );
}

export function MailboxMembers({
  connectionId,
  visibility,
  initialMembers,
  team,
}: {
  connectionId: string;
  visibility: string;
  initialMembers: string[] | null;
  team: { id: string; name: string }[];
}) {
  const t = useTranslations('mailboxes');
  const { toast } = useFeedback();
  const [members, setMembers] = useState<string[] | null>(initialMembers);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (visibility !== 'SHARED') return null;

  async function save(next: string[] | null) {
    setBusy(true);
    try {
      await apiFetch(`/mail/connections/${connectionId}`, {
        method: 'PATCH',
        json: { memberUserIds: next && next.length ? next : null },
      });
      setMembers(next && next.length ? next : null);
      toast.success(t('membersSaved'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    const current = members ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    void save(next);
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-primary-700 hover:underline"
      >
        {members?.length ? t('membersSome', { n: members.length }) : t('membersAll')}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-ink-200 bg-white p-2 shadow-lg">
          <p className="mb-1 text-[11px] text-ink-500">{t('membersHint')}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(null)}
            className="mb-1 block w-full rounded px-2 py-1 text-left text-xs hover:bg-ink-100"
          >
            {members == null ? '✓ ' : ''}
            {t('membersAllOption')}
          </button>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {team.map((u) => (
              <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-ink-100">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={(members ?? []).includes(u.id)}
                  onChange={() => toggle(u.id)}
                />
                {u.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
