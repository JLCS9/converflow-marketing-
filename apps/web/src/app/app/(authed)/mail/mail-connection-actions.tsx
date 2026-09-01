'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useFeedback } from '@/components/ui/feedback';
import { buttonClass } from '@/components/ui/primitives';

interface RecentMsg {
  from?: string;
  subject?: string;
  date?: string;
}

export function MailConnectionActions({ id }: { id: string }) {
  const t = useTranslations('mailboxes');
  const router = useRouter();
  const fb = useFeedback();
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentMsg[] | null>(null);

  async function testSync() {
    setBusy(true);
    setRecent(null);
    try {
      const r = await apiFetch<{ ok: boolean; recent: RecentMsg[] }>(`/mail/connections/${id}/test-sync`, { method: 'POST' });
      fb.toast.success(t('syncOk', { count: r.recent.length }));
      setRecent(r.recent);
      router.refresh();
    } catch (err) {
      fb.toast.error(err instanceof ApiError ? err.message : t('syncError'));
    } finally {
      setBusy(false);
    }
  }

  async function testSend() {
    const to = window.prompt(t('testSendPrompt'));
    if (!to) return;
    setBusy(true);
    try {
      await apiFetch(`/mail/connections/${id}/test-send`, { method: 'POST', json: { to } });
      fb.toast.success(t('testSent'));
      router.refresh();
    } catch (err) {
      fb.toast.error(err instanceof ApiError ? err.message : t('sendError'));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    const ok = await fb.confirm({
      title: t('deleteTitle'),
      description: t('deleteDescription'),
      confirmLabel: t('delete'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/mail/connections/${id}`, { method: 'DELETE' });
      fb.toast.success(t('mailboxDeleted'));
      router.refresh();
    } catch {
      fb.toast.error(t('deleteError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Link href={`/app/mail/${id}`} className="text-xs text-primary-700 hover:underline">{t('edit')}</Link>
        <button type="button" onClick={() => void testSync()} disabled={busy} className={buttonClass('ghost', 'px-2 py-1 text-xs')}>{t('testSync')}</button>
        <button type="button" onClick={() => void testSend()} disabled={busy} className={buttonClass('ghost', 'px-2 py-1 text-xs')}>{t('testSend')}</button>
        <button type="button" onClick={() => void del()} disabled={busy} className={buttonClass('ghost', 'px-2 py-1 text-xs text-red-600')}>{t('delete')}</button>
      </div>
      {recent && recent.length > 0 && (
        <ul className="mt-1 max-w-xs space-y-0.5 text-left text-[11px] text-ink-500">
          {recent.map((m, i) => (
            <li key={i} className="truncate">• {m.subject || t('noSubject')} — {m.from}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
