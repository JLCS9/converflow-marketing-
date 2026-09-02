'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Badge } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';

type Engine = 'LEGACY' | 'ENGINE';

/**
 * E1 · Interruptor explícito del pipeline de IA del bot. Sustituye al
 * conmutador invisible por tenant: el usuario VE y DECIDE qué asistente
 * atiende este canal.
 */
export function BotEngineToggle({
  botId,
  initialEngine,
  hasMemory,
}: {
  botId: string;
  initialEngine: Engine;
  hasMemory: boolean;
}) {
  const t = useTranslations('bots');
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [engine, setEngine] = useState<Engine>(initialEngine);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next: Engine = engine === 'ENGINE' ? 'LEGACY' : 'ENGINE';
    if (next === 'ENGINE' && !hasMemory) {
      const ok = await confirm({
        title: t('engineNoMemoryTitle'),
        description: t('engineNoMemoryBody'),
      });
      if (!ok) return;
    }
    setBusy(true);
    const prev = engine;
    setEngine(next);
    try {
      await apiFetch(`/bots/${botId}`, { method: 'PATCH', json: { aiEngine: next } });
      toast.success(t('engineSaved'));
      router.refresh();
    } catch (e) {
      setEngine(prev);
      toast.error(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
            {t('engineTitle')}
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            {engine === 'ENGINE' ? t('engineOnDesc') : t('engineOffDesc')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Badge color={engine === 'ENGINE' ? 'green' : 'gray'}>
            {engine === 'ENGINE' ? t('engineOnBadge') : t('engineOffBadge')}
          </Badge>
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={busy}
            className="text-xs font-medium text-primary-700 hover:underline disabled:opacity-50"
          >
            {engine === 'ENGINE' ? t('engineSwitchOff') : t('engineSwitchOn')}
          </button>
        </div>
      </div>
    </Card>
  );
}
