import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { LogoutButton } from './logout-button';

interface MeResponse {
  user: {
    userId: string;
    tenantId: string;
    email: string;
    role: string;
    mustChangePassword?: boolean;
  };
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export default async function TenantAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let me: MeResponse;
  let tenant: TenantInfo;
  try {
    [me, tenant] = await Promise.all([
      serverApiFetch<MeResponse>('/auth/me'),
      serverApiFetch<TenantInfo>('/me/tenant'),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }

  // Sidebar badge counts. Never let a hiccup break the whole tenant area.
  let alertCount = 0;
  let convPending = 0;
  try {
    const res = await serverApiFetch<{ count: number }>('/alerts/count');
    alertCount = res.count;
  } catch {
    alertCount = 0;
  }
  try {
    const res = await serverApiFetch<{ pending: number }>('/conversations/count');
    convPending = res.pending;
  } catch {
    convPending = 0;
  }

  return (
    <div className="flex min-h-screen bg-ink-100/30">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-100 bg-white">
        <div className="border-b border-ink-100 px-6 py-5">
          <div className="font-semibold tracking-tight">
            converflow<span className="text-primary-600">.ai</span>
          </div>
          <div className="mt-1 text-xs text-ink-500">{tenant.name}</div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          <NavLink href="/app" label="Dashboard" />
          <NavLink href="/app/conversations" label="Conversaciones" badge={convPending} />
          <NavLink href="/app/alerts" label="Alertas" badge={alertCount} />
          <NavLink href="/app/leads" label="Leads" />
          <NavLink href="/app/opportunities" label="Oportunidades" />
          <NavLink href="/app/clients" label="Clientes" />
          <NavLink href="/app/tasks" label="Tareas" />
          <NavLink href="/app/documents" label="Documentos" />
          <NavLink href="/app/bots" label="Bots" />
          <NavLink href="/app/users" label="Usuarios" />
          <NavLink href="/app/profile" label="Perfil" />
          <NavLink href="/app/settings" label="Ajustes" />
          <div className="mt-6 px-3 text-[10px] font-mono uppercase tracking-wider text-ink-500">
            Soon
          </div>
          <NavLink href="#" label="Agentes IA" disabled />
        </nav>

        <div className="border-t border-ink-100 px-4 py-3 text-xs">
          <div className="text-ink-500">Conectado como</div>
          <div className="truncate font-medium text-ink-900">{me.user.email}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500">
            {me.user.role}
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto">
        {me.user.mustChangePassword && (
          <div className="border-b border-amber-300 bg-amber-100 px-6 py-2 text-xs text-amber-900">
            ⚠️ Estás usando una contraseña temporal.{' '}
            <Link href="/app/profile" className="underline">
              Cámbiala
            </Link>{' '}
            antes de seguir.
          </div>
        )}
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900">
          ⚠️ Esta plataforma utiliza Inteligencia Artificial. Lee la{' '}
          <Link href="/ai-disclosure" className="underline">
            política de uso de IA
          </Link>{' '}
          y la{' '}
          <Link href="/privacy" className="underline">
            política de privacidad
          </Link>
          .
        </div>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

function NavLink({
  href,
  label,
  disabled,
  badge,
}: {
  href: string;
  label: string;
  disabled?: boolean;
  badge?: number;
}) {
  if (disabled) {
    return (
      <span className="block rounded px-3 py-1.5 text-ink-300">{label}</span>
    );
  }
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded px-3 py-1.5 text-ink-700 hover:bg-ink-100"
    >
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
