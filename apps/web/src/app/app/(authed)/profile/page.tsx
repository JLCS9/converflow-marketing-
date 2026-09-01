import { resolveLocale, type UiLocale } from '@converflow/shared';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { ChangePasswordForm } from './change-password-form';
import { LanguageCard } from './language-card';

interface MeResponse {
  user: {
    userId: string;
    email: string;
    mustChangePassword: boolean;
    role: string;
    locale: UiLocale;
  };
}

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('titles.profile') };
}

export default async function ProfilePage() {
  const t = await getTranslations();
  const me = await serverApiFetch<MeResponse>('/auth/me');

  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader title={t('profile.title')} description={t('profile.subtitle')} />

      {me.user.mustChangePassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{t('profile.mustChangeTitle')}</strong> {t('profile.mustChangeBody')}
        </div>
      )}

      <LanguageCard current={resolveLocale(me.user.locale)} />

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('profile.info')}</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Email</dt>
            <dd>{me.user.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Rol</dt>
            <dd className="font-mono">{me.user.role}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
          Cambiar contraseña
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Al cambiar tu contraseña se cerrarán todas tus sesiones (incluida ésta) y tendrás
          que volver a entrar con la nueva.
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </Card>
    </div>
  );
}
