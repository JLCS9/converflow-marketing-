import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CreateBotForm } from './create-form';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('bots.newTitle') };
}

export default async function NewBotPage() {
  const t = await getTranslations('bots');
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/bots" className="text-sm text-ink-500 hover:text-ink-900">
          {t('backToBots')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('newTitle')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('newIntro')}</p>
      </div>
      <CreateBotForm />
    </div>
  );
}
