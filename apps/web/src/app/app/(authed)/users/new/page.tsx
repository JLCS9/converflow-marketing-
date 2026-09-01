import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { InviteUserForm } from './invite-form';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('users.inviteTitle') };
}

export default async function NewUserPage() {
  const t = await getTranslations('users');
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/users" className="text-sm text-ink-500 hover:text-ink-900">
          {t('backToUsersArrow')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('inviteTitle')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('inviteDescription')}</p>
      </div>
      <InviteUserForm />
    </div>
  );
}
