import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { Card, Badge } from '@/components/ui/primitives';

interface ClientDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nif: string | null;
  address: string | null;
  website: string | null;
  source: string | null;
  status: string;
  createdAt: string;
  leads: Array<{ id: string; name: string; status: string }>;
  opportunities: Array<{ id: string; name: string; status: string; amount: string | null }>;
  tasks: Array<{ id: string; title: string; status: string; dueAt: string | null }>;
}

export const metadata = { title: 'Cliente' };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let client: ClientDetail;
  try {
    client = await serverApiFetch<ClientDetail>(`/clients/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/clients" className="text-sm text-ink-500 hover:text-ink-900">← Volver</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{client.name}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm">
          <Badge color={client.status === 'ACTIVE' ? 'green' : 'gray'}>{client.status}</Badge>
          {client.nif && <span className="font-mono text-xs text-ink-500">NIF: {client.nif}</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Información</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {client.email && <Row label="Email" value={client.email} />}
            {client.phone && <Row label="Teléfono" value={client.phone} />}
            {client.address && <Row label="Dirección" value={client.address} />}
            {client.website && <Row label="Web" value={client.website} />}
            <Row label="Alta" value={new Date(client.createdAt).toLocaleString('es-ES')} />
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Oportunidades</h2>
          {client.opportunities.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">Sin oportunidades.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {client.opportunities.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3">
                  <Link href={`/app/opportunities/${o.id}`} className="text-primary-700 hover:underline">
                    {o.name}
                  </Link>
                  <span className="text-xs text-ink-500">
                    {o.amount ? `${Number(o.amount).toLocaleString('es-ES')} € · ` : ''}
                    {o.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Tareas</h2>
        {client.tasks.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">Sin tareas asociadas.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {client.tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <span>{t.title}</span>
                <span className="text-xs text-ink-500">
                  {t.status}{t.dueAt ? ` · ${new Date(t.dueAt).toLocaleDateString('es-ES')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
