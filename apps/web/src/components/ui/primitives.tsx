import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function buttonClass(variant: Variant = 'primary', extra?: string): string {
  const base =
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium ' +
    'transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2';
  const styles: Record<Variant, string> = {
    primary: 'bg-ink-900 text-white hover:bg-ink-700',
    secondary: 'border border-ink-300 text-ink-900 hover:border-ink-700',
    ghost: 'text-ink-700 hover:bg-ink-100',
    danger: 'bg-red-600 text-white hover:bg-red-500',
  };
  return cn(base, styles[variant], extra);
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-ink-100 bg-white p-6', className)}>{children}</div>
  );
}

/**
 * Minimal inline-SVG sparkline (no chart lib). Renders a normalized polyline
 * over a fixed viewBox; the container controls the real size via CSS. Flat or
 * empty series render a baseline.
 */
export function Sparkline({
  data,
  className,
  strokeClass = 'stroke-primary-500',
}: {
  data: number[];
  className?: string;
  strokeClass?: string;
}) {
  const W = 100;
  const H = 28;
  const pad = 2;
  const max = Math.max(...data, 0);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const points = data
    .map((v, i) => {
      const x = pad + i * step;
      const y = H - pad - ((v - min) / span) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('h-7 w-full', className)}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClass}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Week-over-week delta chip. pct null = no prior baseline → "nuevo". */
export function DeltaBadge({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null) {
    return <span className="text-xs font-medium text-ink-400">nuevo</span>;
  }
  const flat = Math.abs(pct) < 0.005;
  const up = pct > 0;
  // "good" is usually up; pass invert for metrics where down is good.
  const good = flat ? null : up !== invert;
  const tone = good === null ? 'text-ink-400' : good ? 'text-green-600' : 'text-red-600';
  const arrow = flat ? '→' : up ? '▲' : '▼';
  return (
    <span className={cn('text-xs font-medium tabular-nums', tone)}>
      {arrow} {Math.abs(Math.round(pct * 100))}%
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  spark,
  sparkStroke,
  delta,
  deltaInvert,
}: {
  label: string;
  value: string | number;
  hint?: string;
  spark?: number[];
  sparkStroke?: string;
  delta?: number | null;
  deltaInvert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-mono uppercase tracking-wider text-ink-500">{label}</div>
        {delta !== undefined && <DeltaBadge pct={delta} invert={deltaInvert} />}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      {spark && spark.some((n) => n > 0) ? (
        <div className="mt-3">
          <Sparkline data={spark} strokeClass={sparkStroke} />
        </div>
      ) : null}
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...rest }, ref) {
    return (
      <label
        ref={ref}
        className={cn('block text-sm font-medium text-ink-900', className)}
        {...rest}
      />
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'mt-1 block w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'mt-1 block w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
          className,
        )}
        {...rest}
      />
    );
  },
);

export function Field({
  label,
  children,
  help,
  required,
}: {
  label: string;
  children: React.ReactNode;
  help?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && (
          <span className="ml-1 text-red-600" aria-label="obligatorio">
            *
          </span>
        )}
      </Label>
      {children}
      {help && <p className="mt-1 text-xs text-ink-500">{help}</p>}
    </div>
  );
}

export function Badge({
  children,
  color = 'gray',
}: {
  children: React.ReactNode;
  color?: 'gray' | 'green' | 'yellow' | 'red' | 'blue';
}) {
  const styles = {
    gray: 'bg-ink-100 text-ink-700',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        styles[color],
      )}
    >
      {children}
    </span>
  );
}

export function tenantStatusBadge(status: string) {
  const map: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
    ACTIVE: 'green',
    TRIAL: 'yellow',
    SUSPENDED: 'red',
    CANCELLED: 'gray',
  };
  return <Badge color={map[status] ?? 'gray'}>{status}</Badge>;
}
