import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { GoogleCalendarCard } from './google-calendar-card';

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
  contactEmail: string;
  contactPhone: string | null;
  timezone: string;
  locale: string;
  createdAt: string;
}

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
}

export const metadata = { title: 'Ajustes' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { google } = await searchParams;
  const [tenant, googleStatus] = await Promise.all([
    serverApiFetch<TenantDetail>('/me/tenant'),
    serverApiFetch<GoogleStatus>('/integrations/google/status'),
  ]);

  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader
        title="Ajustes"
        description={
          <>
            Configuración del tenant. Los límites los gestiona el equipo de converflow — si
            necesitas cambiarlos,{' '}
            <a
              href="mailto:hola@converflow.ai?subject=Ampliar%20l%C3%ADmites%20del%20tenant"
              className="text-primary-700 hover:underline"
            >
              escríbenos
            </a>
            .
          </>
        }
        breadcrumbs={[
          { href: '/app/settings', label: 'Configuración' },
          { label: 'Ajustes' },
        ]}
      />

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          Información general
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">{tenant.name}</Field>
          <Field label="Identificador" mono>
            {tenant.slug}
          </Field>
          <Field label="Email de contacto">{tenant.contactEmail}</Field>
          <Field label="Teléfono">{tenant.contactPhone ?? '—'}</Field>
          <Field label="Zona horaria" mono>
            {tenant.timezone}
          </Field>
          <Field label="Idioma" mono>
            {tenant.locale}
          </Field>
          <Field label="Creado">{new Date(tenant.createdAt).toLocaleString('es-ES')}</Field>
          <Field label="Estado" mono>
            {tenant.status}
          </Field>
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">Plan y límites</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Usuarios" mono>
            {tenant.maxUsers}
          </Field>
          <Field label="Bots" mono>
            {tenant.maxBots}
          </Field>
          <Field label="Conversaciones / mes" mono>
            {tenant.maxConversationsPerMonth}
          </Field>
          <Field label="Almacenamiento" mono>
            {tenant.maxStorageGb} GB
          </Field>
        </dl>
        {tenant.kitDigitalSegment && (
          <p className="mt-4 text-xs text-ink-500">
            Tenant adherido a <strong>Kit Digital · Segmento {tenant.kitDigitalSegment}</strong>.
            Tus logs de acceso quedan registrados y exportables a CSV para evidencias.
          </p>
        )}
      </Card>

      <GoogleCalendarCard status={googleStatus} flash={google} />
    </div>
  );
}

function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={`mt-1 text-sm text-ink-900 ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}
