import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, StatCard } from '@/components/ui/primitives';

interface Stats {
  limits: {
    maxUsers: number;
    maxBots: number;
    maxConversationsPerMonth: number;
    maxStorageGb: number;
  };
  usage: {
    users: number;
    bots: number;
    agents: number;
    accessLogs24h: number;
    accessLogs7d: number;
  };
}

export const metadata = { title: 'Panel' };

export default async function TenantDashboard() {
  const stats = await serverApiFetch<Stats>('/me/stats');

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="mt-1 text-sm text-ink-500">
          Estado de tu tenant. Refrescado en cada carga.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Usuarios"
          value={`${stats.usage.users} / ${stats.limits.maxUsers}`}
          hint="Cuenta activa en este tenant"
        />
        <StatCard
          label="Bots"
          value={`${stats.usage.bots} / ${stats.limits.maxBots}`}
          hint="Bots conectados o en preparación"
        />
        <StatCard label="Agentes IA" value={stats.usage.agents} hint="Definiciones" />
        <StatCard
          label="Accesos (24h)"
          value={stats.usage.accessLogs24h}
          hint={`${stats.usage.accessLogs7d} en los últimos 7 días`}
        />
      </section>

      <Card>
        <h2 className="text-base font-semibold">Empieza aquí</h2>
        <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-ink-700">
          <li>
            <Link href="/app/users" className="text-primary-700 hover:underline">
              Invita a tu equipo
            </Link>{' '}
            — añade usuarios con roles OWNER, ADMIN, BUILDER o AGENT_USER.
          </li>
          <li>
            <Link href="/app/bots/new" className="text-primary-700 hover:underline">
              Crea tu primer bot
            </Link>{' '}
            — escoge canal (WhatsApp por QR llega en Fase 3, Web chat ya).
          </li>
          <li>
            <Link href="/app/access-logs" className="text-primary-700 hover:underline">
              Consulta tus logs de acceso
            </Link>{' '}
            — exportables a CSV para evidencias Kit Digital.
          </li>
        </ol>
      </Card>

      <div className="rounded-lg border border-ink-100 bg-white p-4 text-sm text-ink-500">
        <strong className="text-ink-900">Próximas funcionalidades:</strong> agentes IA con
        Claude, WhatsApp Baileys, conversaciones en tiempo real, lead scoring predictivo,
        integraciones con HubSpot/Salesforce. Te avisamos en{' '}
        <Link href="/changelog" className="text-primary-700 hover:underline">
          /changelog
        </Link>{' '}
        en cada release.
      </div>
    </div>
  );
}
