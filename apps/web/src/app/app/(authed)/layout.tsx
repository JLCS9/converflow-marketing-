import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { LogoutButton } from './logout-button';
import { SidebarNav } from './sidebar-nav';
import { PoliciesBanner } from './policies-banner';
import { FeedbackProvider } from '@/components/ui/feedback';

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
    <FeedbackProvider>
    <div className="flex h-screen overflow-hidden bg-ink-100/30">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-100 bg-white">
        <div className="shrink-0 border-b border-ink-100 px-6 py-[18px]">
          <div className="font-semibold tracking-tight">
            converflow<span className="text-primary-600">.ai</span>
          </div>
          <div className="mt-1 text-xs text-ink-500">{tenant.name}</div>
        </div>

        <SidebarNav convPending={convPending} alertCount={alertCount} />

        <div className="shrink-0 border-t border-ink-100 px-4 py-3 text-xs">
          <div className="text-ink-500">Conectado como</div>
          <div className="truncate font-medium text-ink-900">{me.user.email}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500">
            {me.user.role}
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {me.user.mustChangePassword && (
          <div className="shrink-0 border-b border-amber-300 bg-amber-100 px-6 py-2 text-xs text-amber-900">
            ⚠️ Estás usando una contraseña temporal.{' '}
            <Link href="/app/profile" className="underline">
              Cámbiala
            </Link>{' '}
            antes de seguir.
          </div>
        )}
        <PoliciesBanner />
        <div className="flex-1 overflow-y-auto p-8">{children}</div>
      </main>
    </div>
    </FeedbackProvider>
  );
}
