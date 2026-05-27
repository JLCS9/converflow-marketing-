import Link from 'next/link';
import { CreateOpportunityForm } from './create-form';

export const metadata = { title: 'Nueva oportunidad' };

export default function NewOpportunityPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/opportunities" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nueva oportunidad</h1>
      </div>
      <CreateOpportunityForm />
    </div>
  );
}
