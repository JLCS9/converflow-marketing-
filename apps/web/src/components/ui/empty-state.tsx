import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  cta?: ReactNode;
  /** Tone shifts the icon background. Use 'positive' when the empty state is good news (no alerts, no pending). */
  tone?: 'neutral' | 'positive';
}

export function EmptyState({ title, description, icon, cta, tone = 'neutral' }: Props) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-white p-8 text-center">
      {icon && (
        <div
          className={`mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full ${
            tone === 'positive' ? 'bg-green-50 text-green-700' : 'bg-ink-100 text-ink-500'
          }`}
        >
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-ink-900">{title}</h3>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{description}</p>
      )}
      {cta && <div className="mt-4 inline-flex">{cta}</div>}
    </div>
  );
}
