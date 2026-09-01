'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

type Mode = 'OFF' | 'SUGGEST' | 'AUTO';

const OPTIONS = [
  { value: 'OFF', emoji: '⏸️', titleKey: 'modeOffTitle', descriptionKey: 'modeOffDesc' },
  { value: 'SUGGEST', emoji: '🟡', titleKey: 'modeSuggestTitle', descriptionKey: 'modeSuggestDesc' },
  { value: 'AUTO', emoji: '🟢', titleKey: 'modeAutoTitle', descriptionKey: 'modeAutoDesc' },
] as const;

export function BotReplyMode({
  botId,
  initialMode,
}: {
  botId: string;
  initialMode: Mode;
}) {
  const t = useTranslations('bots');
  const router = useRouter();
  const { toast } = useFeedback();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState(false);

  async function save(next: Mode) {
    if (next === mode) return;
    setBusy(true);
    const prev = mode;
    setMode(next); // optimistic
    try {
      await apiFetch(`/bots/${botId}`, {
        method: 'PATCH',
        json: { replyMode: next },
      });
      toast.success(t('modeSaved'));
      router.refresh();
    } catch (e) {
      setMode(prev);
      toast.error(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
        {t('replyModeLabel')}
      </h2>
      <p className="mt-1 text-xs text-ink-500">{t('replyModeBody')}</p>
      <div className="mt-4 space-y-2">
        {OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={busy}
              onClick={() => void save(opt.value)}
              className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                active
                  ? 'border-primary-500 bg-primary-50/60'
                  : 'border-ink-100 hover:border-ink-300'
              }`}
            >
              <span className="text-lg" aria-hidden>
                {opt.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-900">{t(opt.titleKey)}</div>
                <div className="mt-0.5 text-xs text-ink-500">{t(opt.descriptionKey)}</div>
              </div>
              {active && (
                <span className="shrink-0 rounded bg-primary-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {t('activeBadge')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {busy && <p className="mt-3 text-xs text-ink-500">{t('saving')}</p>}
    </Card>
  );
}
