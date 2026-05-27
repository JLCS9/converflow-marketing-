import Link from 'next/link';
import { InviteUserForm } from './invite-form';

export const metadata = { title: 'Invitar usuario' };

export default function NewUserPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/users" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a usuarios
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Invitar usuario</h1>
        <p className="mt-1 text-sm text-ink-500">
          Crea un usuario en tu tenant. Verás una contraseña temporal en pantalla — pásasela
          al usuario por un canal seguro (1Password, Signal). En una próxima iteración te
          ahorraremos el paso enviándole un email automático.
        </p>
      </div>
      <InviteUserForm />
    </div>
  );
}
