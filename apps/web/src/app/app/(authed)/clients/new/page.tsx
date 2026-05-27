import Link from 'next/link';
import { CreateClientForm } from './create-form';

export const metadata = { title: 'Nuevo cliente' };

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/clients" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo cliente</h1>
      </div>
      <CreateClientForm />
    </div>
  );
}
