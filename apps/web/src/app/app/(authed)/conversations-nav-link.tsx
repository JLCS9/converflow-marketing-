'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

/**
 * Conversaciones nav link with a live "pendientes" badge — polls every 5s so
 * the count updates without a full navigation. Seeded from the server value.
 */
export function ConversationsNavLink({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const r = await apiFetch<{ pending: number }>('/conversations/count');
        if (active) setCount(r.pending);
      } catch {
        /* keep last */
      }
    };
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return (
    <Link
      href="/app/conversations"
      className="flex items-center justify-between rounded px-3 py-1.5 text-ink-700 hover:bg-ink-100"
    >
      <span>Conversaciones</span>
      {count > 0 && (
        <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
