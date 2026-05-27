import Link from 'next/link';
import { CreateTenantForm } from './create-form';

export const metadata = { title: 'Admin · Nuevo tenant' };

export default function NewTenantPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/tenants" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a tenants
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo tenant</h1>
        <p className="mt-1 text-sm text-ink-500">
          Crea un nuevo cliente. Se genera el usuario owner y una contraseña temporal que
          aparecerá en pantalla.
        </p>
      </div>
      <CreateTenantForm />
    </div>
  );
}
