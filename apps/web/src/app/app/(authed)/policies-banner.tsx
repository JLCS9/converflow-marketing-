'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const ACK_KEY = 'cf_policies_ack';

/**
 * AI/privacy disclosure banner. Shown until the user accepts it once; the
 * acceptance is remembered (localStorage) so it doesn't reappear.
 */
export function PoliciesBanner() {
  const t = useTranslations('shell');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(ACK_KEY) !== '1') setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900">
      <span>
        ⚠️ {t('aiBannerIntro')}{' '}
        <Link href="/ai-disclosure" target="_blank" className="underline">
          {t('aiPolicy')}
        </Link>{' '}
        {t('andThe')}{' '}
        <Link href="/privacy" target="_blank" className="underline">
          {t('privacyPolicy')}
        </Link>
        .
      </span>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(ACK_KEY, '1');
          } catch {
            /* ignore */
          }
          setVisible(false);
        }}
        className="shrink-0 rounded border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100"
      >
        {t('accept')}
      </button>
    </div>
  );
}
