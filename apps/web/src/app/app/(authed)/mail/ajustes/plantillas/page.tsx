import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { Card, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar } from '@/components/ui/tab-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { TemplateActions } from '../../../templates/template-actions';

const AJUSTES_TABS = [
  { href: '/app/mail/ajustes', labelKey: 'tabMailboxes' },
  { href: '/app/mail/ajustes/plantillas', labelKey: 'tabTemplates' },
] as const;

interface TemplateRow {
  id: string;
  name: string;
  subject: string | null;
  updatedAt: string;
}

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('mailboxes.templatesMetaTitle') };
}

export default async function MailTemplatesSettingsPage() {
  const t = await getTranslations('mailboxes');
  const templates = await serverApiFetch<TemplateRow[]>('/email-templates').catch(
    () => [] as TemplateRow[],
  );

  return (
    <div className="space-y-6">
      <TabBar items={AJUSTES_TABS.map((tab) => ({ href: tab.href, label: t(tab.labelKey) }))} />
      <PageHeader
        title={t('templatesTitle')}
        description={t('templatesDescription')}
        back={{ href: '/app/mail', label: t('backToMail') }}
        action={
          <Link href="/app/templates/new" className={buttonClass('primary')}>
            {t('newTemplate')}
          </Link>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          title={t('templatesEmptyTitle')}
          description={t('templatesEmptyDescription')}
          cta={
            <Link href="/app/templates/new" className={buttonClass('primary', 'text-xs')}>
              {t('newTemplate')}
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">{t('colName')}</th>
                <th className="hidden px-4 py-3 md:table-cell">{t('colSubject')}</th>
                <th className="hidden px-4 py-3 md:table-cell">{t('colUpdated')}</th>
                <th className="px-4 py-3 text-right">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/app/templates/${tpl.id}`} className="hover:text-primary-700">
                      {tpl.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-ink-600 md:table-cell">{tpl.subject ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-xs text-ink-500 md:table-cell">
                    {new Date(tpl.updatedAt).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TemplateActions id={tpl.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
