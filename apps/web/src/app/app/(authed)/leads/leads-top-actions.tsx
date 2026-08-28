'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buttonClass } from '@/components/ui/primitives';
import { useCan } from '@/lib/session-context';
import { BulkScoreButton } from './bulk-score-button';

interface AgentLite {
  id: string;
  name: string;
  status: string;
  type?: 'CONVERSATIONAL' | 'OPPORTUNITIES' | 'UTILITY';
}

/**
 * Right-aligned action cluster for /app/leads. Pure client component so it
 * can call useCan() to hide buttons the user is not allowed to use. The
 * backend still enforces the same checks via @RequirePerm().
 */
export function LeadsTopActions({
  agents,
  total,
  filterQs,
}: {
  agents: AgentLite[];
  total: number;
  filterQs: string;
}) {
  const t = useTranslations();
  const canBulkAi = useCan('bulkAi');
  const canImport = useCan('import');
  const canCreate = useCan('crm');

  return (
    <div className="flex flex-wrap gap-2">
      {canBulkAi && (
        <BulkScoreButton agents={agents} total={total} filterQs={filterQs} />
      )}
      {canImport && (
        <Link href="/app/leads/import" className={buttonClass('secondary')}>
          ⤒ {t('leads.importCsv')}
        </Link>
      )}
      {canCreate && (
        <Link href="/app/leads/new" className={buttonClass('primary')}>
          + {t('leads.newLead')}
        </Link>
      )}
    </div>
  );
}
