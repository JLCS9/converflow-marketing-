import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { Card, StatCard, tenantStatusBadge } from '@/components/ui/primitives';
import { EditLimitsForm } from './edit-limits-form';
import { DeleteTenantButton } from './delete-tenant-button';
import { ResetOwnerPasswordButton } from './reset-owner-password';

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  maxUsers: number;
  maxBots: number;
  maxConversationsPerMonth: number;
  maxStorageGb: number;
  kitDigitalSegment: string | null;
  kitDigitalActivatedAt: string | null;
  contactEmail: string;
  contactPhone: string | null;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  suspendedAt: string | null;
  _count: { users: number; bots: number; agents: number; accessLogs: number };
}

export const metadata = { title: 'Admin · Tenant' };

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let tenant: TenantDetail;
  try {
    tenant = await serverApiFetch<TenantDetail>(`/admin/tenants/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/tenants" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a tenants
        </Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-ink-500">
              <span className="font-mono">{tenant.slug}</span>
              {tenantStatusBadge(tenant.status)}
              {tenant.kitDigitalSegment && (
                <span className="font-mono text-xs">Kit Digital · Seg. {tenant.kitDigitalSegment}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Usuarios" value={`${tenant._count.users} / ${tenant.maxUsers}`} />
        <StatCard label="Bots" value={`${tenant._count.bots} / ${tenant.maxBots}`} />
        <StatCard label="Agentes" value={tenant._count.agents} />
        <StatCard label="Logs acceso" value={tenant._count.accessLogs} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Información</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="ID" value={tenant.id} mono />
            <Row label="Contacto" value={tenant.contactEmail} />
            {tenant.contactPhone && <Row label="Teléfono" value={tenant.contactPhone} />}
            <Row label="Timezone" value={tenant.timezone} />
            <Row label="Locale" value={tenant.locale} />
            <Row label="Creado" value={new Date(tenant.createdAt).toLocaleString('es-ES')} />
            <Row label="Actualizado" value={new Date(tenant.updatedAt).toLocaleString('es-ES')} />
            {tenant.suspendedAt && (
              <Row
                label="Suspendido"
                value={new Date(tenant.suspendedAt).toLocaleString('es-ES')}
              />
            )}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Límites</h2>
          <p className="mt-1 text-xs text-ink-500">
            Cambia los topes operativos del tenant. Cualquier cambio queda registrado en el
            log de auditoría.
          </p>
          <div className="mt-4">
            <EditLimitsForm
              tenantId={tenant.id}
              initial={{
                maxUsers: tenant.maxUsers,
                maxBots: tenant.maxBots,
                maxConversationsPerMonth: tenant.maxConversationsPerMonth,
                maxStorageGb: tenant.maxStorageGb,
                kitDigitalSegment:
                  (tenant.kitDigitalSegment as 'IV' | 'V' | null) ?? null,
              }}
            />
            <div className="mt-8 border-t border-ink-100 pt-6">
              <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
                Acceso del owner
              </h2>
              <p className="mt-1 mb-3 text-xs text-ink-500">
                Si el owner perdió la contraseña temporal o no consigue entrar, regenera una
                nueva. Las sesiones anteriores se revocan y se fuerza cambio en el primer login.
              </p>
              <ResetOwnerPasswordButton tenantId={tenant.id} />
            </div>

            <div className="mt-8 border-t border-ink-100 pt-6">
              <h2 className="text-sm font-mono uppercase tracking-wider text-red-700">
                Zona peligrosa
              </h2>
              <p className="mt-1 mb-4 text-xs text-ink-500">
                Eliminar este tenant borra usuarios, bots, logs y todo lo asociado de forma
                irreversible.
              </p>
              <DeleteTenantButton tenantId={tenant.id} tenantSlug={tenant.slug} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={`text-right text-ink-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
