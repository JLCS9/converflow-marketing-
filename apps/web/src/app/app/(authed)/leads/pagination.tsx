'use client';

import Link from 'next/link';

interface Props {
  page: number;
  totalPages: number;
  perPage: number;
  total: number;
  filterQs: string;
}

/**
 * Numeric pagination footer: « ‹ 1 … 4 [5] 6 … 12 › »
 * Builds links from filterQs so the existing status/search filters survive the
 * page change.
 */
export function LeadsPagination({ page, totalPages, perPage, total, filterQs }: Props) {
  if (totalPages <= 1) return null;

  function href(p: number) {
    const qs = new URLSearchParams(filterQs);
    qs.set('page', String(p));
    qs.set('perPage', String(perPage));
    return `/app/leads?${qs.toString()}`;
  }

  // Compact page-window: first, last and 5 around current.
  const pages: number[] = [];
  const push = (n: number) => {
    if (n >= 1 && n <= totalPages && !pages.includes(n)) pages.push(n);
  };
  push(1);
  for (let i = page - 2; i <= page + 2; i += 1) push(i);
  push(totalPages);
  pages.sort((a, b) => a - b);

  // Insert ellipsis markers.
  const withGaps: (number | 'gap')[] = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1]! > 1) withGaps.push('gap');
    withGaps.push(n);
  });

  return (
    <nav
      aria-label="Paginación de leads"
      className="flex flex-wrap items-center justify-between gap-3 text-xs"
    >
      <span className="text-ink-500">
        Página {page} de {totalPages} · {total.toLocaleString('es-ES')} leads
      </span>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <PaginationLink
            disabled={page === 1}
            href={href(Math.max(1, page - 1))}
            aria-label="Página anterior"
          >
            ‹
          </PaginationLink>
        </li>
        {withGaps.map((p, i) =>
          p === 'gap' ? (
            <li key={`gap-${i}`} className="px-1.5 text-ink-400">
              …
            </li>
          ) : (
            <li key={p}>
              <PaginationLink
                href={href(p)}
                active={p === page}
                aria-label={`Página ${p}`}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </PaginationLink>
            </li>
          ),
        )}
        <li>
          <PaginationLink
            disabled={page === totalPages}
            href={href(Math.min(totalPages, page + 1))}
            aria-label="Página siguiente"
          >
            ›
          </PaginationLink>
        </li>
      </ul>
    </nav>
  );
}

function PaginationLink({
  href,
  children,
  active,
  disabled,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
} & React.AriaAttributes) {
  const base =
    'inline-flex h-7 min-w-[28px] items-center justify-center rounded border px-1.5 font-mono text-xs';
  if (disabled) {
    return (
      <span
        className={`${base} cursor-not-allowed border-ink-100 text-ink-300`}
        {...rest}
      >
        {children}
      </span>
    );
  }
  if (active) {
    return (
      <span
        className={`${base} cursor-default border-ink-900 bg-ink-900 text-white`}
        {...rest}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} border-ink-200 text-ink-700 hover:border-ink-900 hover:text-ink-900`}
      {...rest}
    >
      {children}
    </Link>
  );
}
