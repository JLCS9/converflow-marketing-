import { AdminLoginForm } from './admin-login-form';

export const metadata = { title: 'Admin · Login' };

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-ink-900 text-white">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-primary-500">
            converflow.ai · platform
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Panel de administración</h1>
          <p className="mt-2 text-sm text-ink-300">
            Acceso restringido. Se registra cada intento en el log de auditoría.
          </p>
        </div>
        <AdminLoginForm />
      </div>
    </div>
  );
}
