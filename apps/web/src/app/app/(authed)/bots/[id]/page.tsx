import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { serverApiFetch, ApiError } from '@/lib/server-api';
import { Card } from '@/components/ui/primitives';
import { getLabelMaps } from '@/lib/get-labels';
import { BotConnection } from './bot-connection';
import { BotAgentSelect } from './bot-agent-select';
import { BotEmailConnect } from './bot-email-connect';
import { WebchatInstall } from './webchat-install';
import { BotReplyMode } from './bot-reply-mode';
import { BotEngineToggle } from './bot-engine-toggle';

interface BotDetail {
  id: string;
  name: string;
  channel: string;
  phoneNumber: string | null;
  status: string;
  agentId: string | null;
  replyMode: 'OFF' | 'SUGGEST' | 'AUTO';
  maxMessagesPerMinute: number;
  maxMessagesPerHour: number;
  lastConnectedAt: string | null;
  lastDisconnectAt: string | null;
  lastDisconnectReason: string | null;
  createdAt: string;
  aiEngine?: 'LEGACY' | 'ENGINE';
}

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('bots.detailTitle') };
}

export default async function BotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations('bots');
  const { CHANNEL } = await getLabelMaps();
  const { id } = await params;
  let bot: BotDetail;
  try {
    bot = await serverApiFetch<BotDetail>(`/bots/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const agents = await serverApiFetch<{ id: string; name: string; status: string }[]>(
    '/agents',
  ).catch(() => []);
  const knowledgeSources = await serverApiFetch<{ sourceRef: string }[]>('/knowledge/sources').catch(
    () => [],
  );

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.converflow.ai';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/bots" className="text-sm text-ink-500 hover:text-ink-900">
          {t('backToBots')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{bot.name}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {CHANNEL[bot.channel] ?? bot.channel}
          {bot.phoneNumber && <> · {bot.phoneNumber}</>}
        </p>
      </div>

      {bot.channel === 'WHATSAPP' ? (
        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('waConnTitle')}</h2>
          <p className="mt-1 text-xs text-ink-500">{t('waConnBody')}</p>
          <div className="mt-4">
            <BotConnection botId={bot.id} initialStatus={bot.status} />
          </div>
        </Card>
      ) : bot.channel === 'EMAIL' ? (
        <Card>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('emailConnTitle')}</h2>
          <p className="mt-1 text-xs text-ink-500">{t('emailConnBody')}</p>
          <div className="mt-4">
            <BotEmailConnect botId={bot.id} />
          </div>
        </Card>
      ) : bot.channel === 'WEBCHAT' ? (
        <WebchatInstall botId={bot.id} appUrl={appUrl} />
      ) : (
        <Card>
          <p className="text-sm text-ink-500">{t('noAutoConnection')}</p>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('aiAgentTitle')}</h2>
        <p className="mt-1 text-xs text-ink-500">
          {t('agentIntro')}{' '}
          <Link href="/app/agents" className="text-primary-700 hover:underline">
            {t('agentsLinkLabel')}
          </Link>
          .
        </p>
        <div className="mt-4">
          <BotAgentSelect botId={bot.id} currentAgentId={bot.agentId} agents={agents} />
        </div>
      </Card>

      <BotReplyMode botId={bot.id} initialMode={bot.replyMode ?? 'SUGGEST'} />

      <BotEngineToggle
        botId={bot.id}
        initialEngine={bot.aiEngine ?? 'LEGACY'}
        hasMemory={knowledgeSources.length > 0}
      />

      <Card>
        <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">{t('detailsTitle')}</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Row label={t('limitPerMinute')} value={String(bot.maxMessagesPerMinute)} />
          <Row label={t('limitPerHour')} value={String(bot.maxMessagesPerHour)} />
          <Row
            label={t('lastConnection')}
            value={bot.lastConnectedAt ? new Date(bot.lastConnectedAt).toLocaleString('es-ES') : '—'}
          />
          <Row
            label={t('lastDisconnect')}
            value={
              bot.lastDisconnectAt
                ? `${new Date(bot.lastDisconnectAt).toLocaleString('es-ES')}${
                    bot.lastDisconnectReason ? ` (${bot.lastDisconnectReason})` : ''
                  }`
                : '—'
            }
          />
          <Row label={t('created')} value={new Date(bot.createdAt).toLocaleString('es-ES')} />
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-1 text-ink-900">{value}</dd>
    </div>
  );
}
