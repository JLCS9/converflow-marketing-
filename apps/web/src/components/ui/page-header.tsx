import Link from 'next/link';
import type { ReactNode } from 'react';

interface Crumb {
  href?: string;
  label: string;
}

interface Props {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label?: string };
  breadcrumbs?: Crumb[];
}

export function PageHeader({ title, description, action, back, breadcrumbs }: Props) {
  return (
    <header className="space-y-2">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Migas de pan" className="text-xs text-ink-500">
          {breadcrumbs.map((c, i) => (
            <span key={i}>
              {c.href ? (
                <Link href={c.href} className="hover:text-ink-900">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <span className="px-1.5 text-ink-300">/</span>}
            </span>
          ))}
        </nav>
      ) : back ? (
        <Link href={back.href} className="text-sm text-ink-500 hover:text-ink-900">
          ← {back.label ?? 'Volver'}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <div className="mt-1 text-sm text-ink-500">{description}</div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
