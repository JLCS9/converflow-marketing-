import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('settings.developer.metaTitle') };
}

/**
 * Server entry for /app/settings/developer. Loads the existing API keys
 * for the tenant + the current user's identity so the client component
 * can render and gate sensitive actions. Only OWNER/ADMIN (i.e. users
 * with the `users` permission) get to see the keys at all.
 */
export default async function DeveloperSettingsPage() {
  const t = await getTranslations('settings');
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
        title={t('developer.title')}
        description={t('developer.description')}
      />

      {!canManage ? (
        <Card>
          <p className="text-sm text-ink-700">
            {t.rich('developer.restricted', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p className="mt-3 text-xs text-ink-500">
            {t('developer.docsQuestion')}{' '}
            <Link href="/app/ayuda#desarrollador" className="text-primary-700 hover:underline">
              {t('developer.docsLink')}
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
          {t('developer.moreInfo')}
        </h2>
        <p className="mt-2 text-sm text-ink-700">
          {t('developer.readGuide')}{' '}
          <Link
            href="/app/ayuda#desarrollador"
            className={buttonClass('secondary', 'mt-2 inline-block text-xs')}
          >
            {t('developer.docsLink')}
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
