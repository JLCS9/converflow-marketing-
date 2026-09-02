import { getTranslations } from 'next-intl/server';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, IA_TABS } from '@/components/ui/tab-bar';
import { AiReportPanel, type ReportRow } from './ai-report-panel';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('aiReport.title') };
}
export const dynamic = 'force-dynamic';

export default async function AiReportPage() {
  const t = await getTranslations('aiReport');
  const reports = await serverApiFetch<ReportRow[]>('/ai/reports/monthly').catch(() => []);

  return (
    <div className="space-y-6">
      <TabBar items={IA_TABS} />
      <PageHeader title={t('title')} description={t('description')} />
      <AiReportPanel initialReports={reports} />
    </div>
  );
}
