import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle, Lock, Users } from 'lucide-react';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar } from '@/components/ui/tab-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { MailConnectionActions } from '../mail-connection-actions';
import { MailboxAiMode, MailboxMembers } from './mailbox-autonomy';
import { MailRoutingRules, type RuleRow } from './mail-routing-rules';

const AJUSTES_TABS = [
  { href: '/app/mail/ajustes', labelKey: 'tabMailboxes' },
  { href: '/app/mail/ajustes/plantillas', labelKey: 'tabTemplates' },
] as const;

interface ConnRow {
  id: string;
  fromAddress: string;
  displayName: string | null;
  driver: string;
  visibility: string;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  aiReplyMode?: 'OFF' | 'SUGGEST' | 'AUTO';
  memberUserIds?: string[] | null;
}

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('mailboxes.metaTitle') };
}

const STATUS = {
  PENDING: { labelKey: 'statusPending', color: 'yellow' },
  CONNECTED: { labelKey: 'statusConnected', color: 'green' },
  // Fallo transitorio: se sigue sincronizando con reintentos, no requiere acción.
  DEGRADED: { labelKey: 'statusRetrying', color: 'yellow' },
  ERROR: { labelKey: 'statusActionRequired', color: 'red' },
} as const;

export default async function MailConnectionsSettingsPage() {
  const t = await getTranslations('mailboxes');
  const [conns, team, rules, automation] = await Promise.all([
    serverApiFetch<ConnRow[]>('/mail/connections').catch(() => [] as ConnRow[]),
    serverApiFetch<{ id: string; name: string }[]>('/mail/team').catch(() => []),
    serverApiFetch<RuleRow[]>('/routing-rules?channel=EMAIL').catch(() => [] as RuleRow[]),
    // Solo quien tiene permiso de configuración lo ve (403 → sin aviso).
    serverApiFetch<{ aiInboundAnalysis: boolean }>('/me/automation').catch(() => null),
  ]);
  // El interruptor global del tenant manda sobre el modo por buzón: si está
  // apagado, el Asistente no propone nada aunque aquí se active — avisarlo
  // aquí evita el «lo activé y no pasa nada».
  const inboundOff = automation != null && !automation.aiInboundAnalysis;

  return (
    <div className="space-y-6">
      <TabBar items={AJUSTES_TABS.map((tab) => ({ href: tab.href, label: t(tab.labelKey) }))} />
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: '/app/mail', label: t('backToMail') }}
        action={
          <Link href="/app/mail/new" className={buttonClass('primary')}>
            {t('connectMailbox')}
          </Link>
        }
      />

      {inboundOff && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <p>
            {t('inboundOffWarning')}{' '}
            <Link href="/app/settings" className="font-medium underline">
              {t('inboundOffCta')}
            </Link>
          </p>
        </div>
      )}

      {conns.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          cta={
            <Link href="/app/mail/new" className={buttonClass('primary', 'text-xs')}>
              {t('connectMailbox')}
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">{t('colMailbox')}</th>
                <th className="px-4 py-3">{t('colVisibility')}</th>
                <th className="px-4 py-3">{t('colAssistant')}</th>
                <th className="px-4 py-3">{t('colStatus')}</th>
                <th className="px-4 py-3 text-right">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {conns.map((c) => {
                const st =
                  STATUS[c.status as keyof typeof STATUS] ??
                  ({ labelKey: null, color: 'gray' } as const);
                return (
                  <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.fromAddress}</div>
                      {c.displayName && <div className="text-xs text-ink-500">{c.displayName}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="inline-flex items-center gap-1 text-ink-600">
                        {c.visibility === 'PRIVATE' ? <Lock size={12} /> : <Users size={12} />}
                        {c.visibility === 'PRIVATE' ? t('private') : t('shared')}
                      </div>
                      <div className="mt-0.5">
                        <MailboxMembers
                          connectionId={c.id}
                          visibility={c.visibility}
                          initialMembers={c.memberUserIds ?? null}
                          team={team}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <MailboxAiMode connectionId={c.id} initialMode={c.aiReplyMode ?? 'OFF'} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={st.color}>{st.labelKey ? t(st.labelKey) : c.status}</Badge>
                      {(c.status === 'ERROR' || c.status === 'DEGRADED') && c.lastError && (
                        <div className="mt-0.5 max-w-xs truncate text-[11px] text-red-600" title={c.lastError}>
                          {c.lastError}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MailConnectionActions id={c.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <MailRoutingRules
        initialRules={rules}
        mailboxes={conns.map((c) => ({ id: c.id, fromAddress: c.fromAddress }))}
        team={team}
      />
    </div>
  );
}
