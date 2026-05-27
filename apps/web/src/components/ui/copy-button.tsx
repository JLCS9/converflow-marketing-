'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

export function CopyButton({
  value,
  label = 'Copiar',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — user can still select manually */
        }
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded border border-ink-300 px-2 py-1 text-xs ' +
          'text-ink-700 hover:bg-ink-100 active:bg-ink-100',
        className,
      )}
    >
      {copied ? '✓ Copiado' : `⎘ ${label}`}
    </button>
  );
}
