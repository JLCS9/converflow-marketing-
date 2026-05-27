import Link from 'next/link';
import { CreateLeadForm } from './create-form';

export const metadata = { title: 'Nuevo lead' };

export default function NewLeadPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/leads" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a leads
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo lead</h1>
        <p className="mt-1 text-sm text-ink-500">
          Datos básicos. Los demás campos los enriquecen los agentes IA según interactúa
          con tu equipo.
        </p>
      </div>
      <CreateLeadForm />
    </div>
  );
}
