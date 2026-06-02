import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ApiKeySummary } from '@converflow/shared';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { Card, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { DeveloperPanel } from './developer-panel';

interface MeUser {
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'BUILDER' | 'AGENT_USER' | 'API_KEY';
  permissions: string[];
}

export const metadata = { title: 'Desarrollador · Ajustes' };

/**
 * Server entry for /app/settings/developer. Loads the existing API keys
 * for the tenant + the current user's identity so the client component
 * can render and gate sensitive actions. Only OWNER/ADMIN (i.e. users
 * with the `users` permission) get to see the keys at all.
 */
export default async function DeveloperSettingsPage() {
  let me: { user: MeUser };
  try {
    me = await serverApiFetch<{ user: MeUser }>('/auth/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  const canManage =
    me.user.role === 'OWNER' || me.user.permissions.includes('users');

  let keys: ApiKeySummary[] = [];
  if (canManage) {
    try {
      keys = await serverApiFetch<ApiKeySummary[]>('/api-keys');
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 403)) throw err;
    }
  }

  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader
        title="Desarrollador"
        description={
          <>
            Conecta Converflow con tus integraciones, scripts internos y
            herramientas externas (Zapier, Make, n8n, formularios propios, etc.).
            Las API keys son privadas y dan acceso a los datos de esta cuenta —
            trátalas como una contraseña.
          </>
        }
      />

      {!canManage ? (
        <Card>
          <p className="text-sm text-ink-700">
            La gestión de API keys está reservada a los roles{' '}
            <strong>Propietario</strong> y <strong>Administrador</strong>. Pide a
            tu propietario que te dé acceso o que genere una key por ti.
          </p>
          <p className="mt-3 text-xs text-ink-500">
            ¿Buscas la documentación de la API? Está en{' '}
            <Link href="/app/ayuda#desarrollador" className="text-primary-700 hover:underline">
              Centro de Ayuda → API para desarrolladores
            </Link>
            .
          </p>
        </Card>
      ) : (
        <DeveloperPanel
          initialKeys={keys}
          apiBaseHint={(process.env.NEXT_PUBLIC_API_URL ?? '').trim() || ''}
        />
      )}

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          Más información
        </h2>
        <p className="mt-2 text-sm text-ink-700">
          Lee la guía completa de uso, lista de endpoints y ejemplos en{' '}
          <Link
            href="/app/ayuda#desarrollador"
            className={buttonClass('secondary', 'mt-2 inline-block text-xs')}
          >
            Centro de Ayuda → API para desarrolladores
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
