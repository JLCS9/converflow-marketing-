/**
 * bot-runner — hosts long-lived WhatsApp/Baileys sessions, one per Bot row.
 *
 * Sprint 7 Phase A: real Baileys connection + QR enrollment + persistent
 * encrypted auth state (bot_sessions) + status transitions + auto-reconnect.
 * Inbound message handling + outbound sending land in later phases.
 *
 * Exposes a Fastify internal API (shared-token auth) the upstream NestJS API
 * calls to start/stop a bot and poll its QR/status.
 */
import Fastify from 'fastify';
import pino from 'pino';
import {
  startBot,
  stopBot,
  getState,
  reconnectAll,
  activeSessionCount,
  sendText,
  sendDocument,
} from './session-manager';

const logger = pino({ name: 'bot-runner' });
const port = Number(process.env.BOT_RUNNER_PORT ?? 4100);
const internalToken = process.env.BOT_RUNNER_INTERNAL_TOKEN ?? '';

const app = Fastify({ logger: false });

app.get('/health', async () => ({ status: 'ok', sessions: activeSessionCount() }));

// Internal API — protected by a shared token, not exposed to the public internet.
app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return;
  const token = req.headers['x-internal-token'];
  if (!internalToken || token !== internalToken) {
    await reply.code(401).send({ error: 'unauthorized' });
  }
});

app.post<{ Params: { id: string }; Body: { tenantId: string } }>(
  '/bots/:id/start',
  async (req) => {
    const { id } = req.params;
    const { tenantId } = req.body;
    if (!tenantId) return { ok: false, error: 'tenantId required' };
    logger.info({ botId: id }, 'start requested');
    const res = await startBot(id, tenantId);
    return { ok: true, ...res };
  },
);

app.post<{ Params: { id: string } }>('/bots/:id/stop', async (req) => {
  const { id } = req.params;
  logger.info({ botId: id }, 'stop requested');
  await stopBot(id);
  return { ok: true };
});

app.get<{ Params: { id: string } }>('/bots/:id/state', async (req) => {
  return getState(req.params.id);
});

app.post<{ Params: { id: string }; Body: { jid: string; text: string } }>(
  '/bots/:id/send',
  async (req, reply) => {
    try {
      const r = await sendText(req.params.id, req.body.jid, req.body.text);
      return { ok: true, ...r };
    } catch (err) {
      logger.warn({ err, botId: req.params.id }, 'send failed');
      return reply.code(409).send({ ok: false, error: (err as Error).message });
    }
  },
);

app.post<{
  Params: { id: string };
  Body: { jid: string; url: string; fileName: string; mimetype: string };
}>('/bots/:id/send-document', async (req, reply) => {
  try {
    const { jid, url, fileName, mimetype } = req.body;
    const r = await sendDocument(req.params.id, jid, { url, fileName, mimetype });
    return { ok: true, ...r };
  } catch (err) {
    logger.warn({ err, botId: req.params.id }, 'send-document failed');
    return reply.code(409).send({ ok: false, error: (err as Error).message });
  }
});

async function main(): Promise<void> {
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'bot-runner listening');
  // Reconnect previously-connected bots in the background (don't block boot).
  void reconnectAll().catch((err) => logger.error({ err }, 'reconnectAll failed'));
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'shutting down bot-runner');
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void main();
