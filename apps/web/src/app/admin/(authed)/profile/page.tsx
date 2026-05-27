import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge } from '@/components/ui/primitives';
import { ChangePasswordForm } from './change-password-form';
import { Enroll2faSection } from './enroll-2fa-section';

interface MeResponse {
  admin: {
    adminId: string;
    email: string;
    name: string;
    totpEnabled: boolean;
    mustChangePassword: boolean;
  };
}

export const metadata = { title: 'Admin · Perfil' };

export default async function AdminProfilePage() {
  const me = await serverApiFetch<MeResponse>('/admin/auth/me');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Perfil de administrador</h1>
        <p className="mt-1 text-sm text-ink-500">
          Seguridad de tu cuenta de plataforma.
        </p>
      </header>

      {me.admin.mustChangePassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Cambia tu contraseña temporal.</strong> Antes de seguir gestionando tenants
          actualiza la password con una propia.
        </div>
      )}

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Información</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Email</dt>
            <dd>{me.admin.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Nombre</dt>
            <dd>{me.admin.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">2FA TOTP</dt>
            <dd>
              {me.admin.totpEnabled ? (
                <Badge color="green">Activado</Badge>
              ) : (
                <Badge color="yellow">No activado</Badge>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          Cambiar contraseña
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Al cambiar tu contraseña se cerrarán todas tus sesiones (incluida ésta).
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          Autenticación de dos factores (TOTP)
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          {me.admin.totpEnabled
            ? 'Tu cuenta exige TOTP en cada login. Si quieres rotar el secret, vuelve a enrolar.'
            : 'Configura una app autenticadora (1Password, Authy, Aegis, Bitwarden) y escanea el QR.'}
        </p>
        <div className="mt-4">
          <Enroll2faSection totpEnabled={me.admin.totpEnabled} />
        </div>
      </Card>
    </div>
  );
}
