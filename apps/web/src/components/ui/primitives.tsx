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

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-5">
      <div className="text-xs font-mono uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
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
          'mt-1 block w-full rounded-md border-ink-300 focus:border-primary-500 focus:ring-primary-500',
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
          'mt-1 block w-full rounded-md border-ink-300 focus:border-primary-500 focus:ring-primary-500',
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
          'mt-1 block w-full rounded-md border-ink-300 focus:border-primary-500 focus:ring-primary-500',
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
        {required && <span className="ml-1 text-red-600">*</span>}
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
