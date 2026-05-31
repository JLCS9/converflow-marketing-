import { redirect } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { AppShell } from './app-shell';
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
      <AppShell
        tenantName={tenant.name}
        userEmail={me.user.email}
        userRole={me.user.role}
        mustChangePassword={!!me.user.mustChangePassword}
        convPending={convPending}
        alertCount={alertCount}
      >
        {children}
      </AppShell>
    </FeedbackProvider>
  );
}
