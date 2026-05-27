import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { LogoutButton } from './logout-button';

interface MeResponse {
  admin: {
    adminId: string;
    email: string;
    name?: string;
    totpEnabled?: boolean;
    mustChangePassword?: boolean;
  };
}

export default async function AdminAuthedLayout({ children }: { children: React.ReactNode }) {
  let me: MeResponse;
  try {
    me = await serverApiFetch<MeResponse>('/admin/auth/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/admin/login');
    }
    throw err;
  }

  return (
    <div className="flex min-h-screen bg-ink-100/40">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-100 bg-ink-900 text-ink-100">
        <div className="border-b border-ink-700/50 px-6 py-5">
          <div className="font-semibold tracking-tight text-white">
            converflow<span className="text-primary-500">.ai</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-primary-500">
            platform
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          <NavLink href="/admin" label="Dashboard" />
          <NavLink href="/admin/tenants" label="Tenants" />
          <NavLink href="/admin/bots" label="Bots (global)" />
          <NavLink href="/admin/profile" label="Perfil + 2FA" />
          <div className="mt-6 px-3 text-[10px] font-mono uppercase tracking-wider text-ink-500">
            Soon
          </div>
          <NavLink href="#" label="Users (global)" disabled />
          <NavLink href="#" label="Audit log" disabled />
          <NavLink href="#" label="System" disabled />
        </nav>

        <div className="border-t border-ink-700/50 px-4 py-3 text-xs">
          <div className="text-ink-300">Signed in as</div>
          <div className="truncate text-white">{me.admin.email}</div>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto">
        <header className="flex h-12 items-center justify-end gap-4 border-b border-ink-100 bg-white px-6 text-sm">
          <Link
            href="https://api.converflow.ai/docs"
            target="_blank"
            className="text-ink-500 hover:text-ink-900"
          >
            API docs ↗
          </Link>
          <span className="font-mono text-xs text-ink-300">v0.1.0</span>
        </header>
        {me.admin.mustChangePassword && (
          <div className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-900">
            ⚠️ Estás usando una contraseña temporal.{' '}
            <Link href="/admin/profile" className="underline">
              Cámbiala
            </Link>{' '}
            antes de seguir.
          </div>
        )}
        {!me.admin.totpEnabled && (
          <div className="border-b border-yellow-200 bg-yellow-50 px-6 py-2 text-xs text-yellow-900">
            🔐 Recomendado: activa 2FA TOTP en{' '}
            <Link href="/admin/profile" className="underline">
              tu perfil
            </Link>
            .
          </div>
        )}
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

function NavLink({
  href,
  label,
  indent,
  disabled,
}: {
  href: string;
  label: string;
  indent?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span
        className={`block rounded px-3 py-1.5 text-ink-500/50 ${indent ? 'pl-7' : ''}`}
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`block rounded px-3 py-1.5 text-ink-100 hover:bg-ink-700/50 ${indent ? 'pl-7' : ''}`}
    >
      {label}
    </Link>
  );
}
