import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { ChangePasswordForm } from './change-password-form';

interface MeResponse {
  user: { userId: string; email: string; mustChangePassword: boolean; role: string };
}

export const metadata = { title: 'Perfil' };

export default async function ProfilePage() {
  const me = await serverApiFetch<MeResponse>('/auth/me');

  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader title="Perfil" description="Datos de tu cuenta y seguridad." />

      {me.user.mustChangePassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Debes cambiar tu contraseña.</strong> Te entregamos una temporal — actualízala
          por una propia antes de seguir usando la plataforma.
        </div>
      )}

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Información</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Email</dt>
            <dd>{me.user.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Rol</dt>
            <dd className="font-mono">{me.user.role}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          Cambiar contraseña
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Al cambiar tu contraseña se cerrarán todas tus sesiones (incluida ésta) y tendrás
          que volver a entrar con la nueva.
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </Card>
    </div>
  );
}
