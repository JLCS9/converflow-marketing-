/**
 * bot-runner — hosts long-lived WhatsApp/Baileys sessions, one per Bot row.
 *
 * Lifecycle (full impl in Fase 3):
 *   1. On startup, load all bots with status=CONNECTED and reconnect using
 *      encrypted auth state from bot_sessions.
 *   2. Subscribe to Redis channel `bot:control` for start/stop commands from
 *      the API.
 *   3. For each active session, push events to Redis stream `bot:events`:
 *        - qr (during pairing)
 *        - status transitions
 *        - incoming messages (text/media)
 *   4. On graceful shutdown, flush auth state and close sockets cleanly so
 *      reconnection on the next boot doesn't require a fresh QR scan.
 *
 * This file is the scaffolding only. It exposes a Fastify health endpoint
 * and an internal control API for the upstream API to talk to.
 */
import Fastify from 'fastify';
import IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'bot-runner' });
const port = Number(process.env.BOT_RUNNER_PORT ?? 4100);
const internalToken = process.env.BOT_RUNNER_INTERNAL_TOKEN ?? '';

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const app = Fastify({ logger: false });

app.get('/health', async () => ({ status: 'ok', sessions: 0 }));

// Internal API — protected by a shared token, not exposed to the public internet.
app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return;
  const token = req.headers['x-internal-token'];
  if (!internalToken || token !== internalToken) {
    reply.code(401).send({ error: 'unauthorized' });
  }
});

app.post<{ Body: { botId: string; tenantId: string } }>('/bots/start', async (req) => {
  // TODO Fase 3: spawn Baileys session, persist auth state, emit QR over redis pub/sub.
  logger.info({ botId: req.body.botId }, 'bot start requested (stub)');
  return { ok: true, stub: true };
});

app.post<{ Body: { botId: string } }>('/bots/stop', async (req) => {
  // TODO Fase 3: graceful logout + cleanup
  logger.info({ botId: req.body.botId }, 'bot stop requested (stub)');
  return { ok: true, stub: true };
});

async function main() {
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'bot-runner listening');
}

async function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'shutting down bot-runner');
  await app.close();
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void main();
