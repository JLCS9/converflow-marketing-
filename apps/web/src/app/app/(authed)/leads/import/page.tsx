import Link from 'next/link';
import { ImportLeadsForm } from './import-form';

export const metadata = { title: 'Importar leads' };

export default function ImportLeadsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/app/leads" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a leads
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Importar leads desde CSV</h1>
        <p className="mt-1 text-sm text-ink-500">
          Sube un CSV con columnas <code className="font-mono">name, email, phone, company, source</code>.
          Headers en la primera fila. Cualquier columna extra se ignora.
        </p>
      </div>
      <ImportLeadsForm />
    </div>
  );
}
