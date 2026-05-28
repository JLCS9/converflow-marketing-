import makeWASocket, {
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  type WASocket,
} from 'baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { useDbAuthState } from './auth-state';
import { setBotStatus, listReconnectableBots } from './db';
import { handleIncomingMessages } from './inbound';

type RuntimeStatus =
  | 'AWAITING_QR'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'BANNED'
  | 'ERROR';

interface Runtime {
  sock?: WASocket;
  status: RuntimeStatus;
  qr?: string; // data URL, only meaningful while AWAITING_QR
  tenantId: string;
  stopping: boolean;
  reconnectAttempts: number;
}

const MAX_RECONNECTS = 5;
const sessions = new Map<string, Runtime>();
const logger = pino({ name: 'bot-runner', level: process.env.BOT_RUNNER_LOG_LEVEL ?? 'info' });
const baileysLogger = pino({ level: 'silent' });

export function activeSessionCount(): number {
  return sessions.size;
}

export function getState(botId: string): { status: RuntimeStatus; qr: string | null } {
  const rt = sessions.get(botId);
  if (!rt) return { status: 'DISCONNECTED', qr: null };
  return { status: rt.status, qr: rt.status === 'AWAITING_QR' ? (rt.qr ?? null) : null };
}

export async function startBot(botId: string, tenantId: string): Promise<{ status: RuntimeStatus }> {
  const existing = sessions.get(botId);
  if (
    existing &&
    (existing.status === 'CONNECTED' ||
      existing.status === 'CONNECTING' ||
      existing.status === 'AWAITING_QR')
  ) {
    return { status: existing.status };
  }
  await connect(botId, tenantId);
  return { status: getState(botId).status };
}

export async function stopBot(botId: string): Promise<void> {
  const rt = sessions.get(botId);
  if (!rt) return;
  rt.stopping = true;
  try {
    // end() closes the socket but keeps the persisted creds, so a later
    // start reconnects WITHOUT a new QR scan.
    rt.sock?.end(undefined);
  } catch (err) {
    logger.warn({ err, botId }, 'error ending socket');
  }
  rt.status = 'DISCONNECTED';
  await setBotStatus(rt.tenantId, botId, 'DISCONNECTED', { disconnectReason: 'stopped' });
  sessions.delete(botId);
}

async function connect(botId: string, tenantId: string): Promise<void> {
  const { state, saveCreds, clear } = await useDbAuthState(botId, tenantId);
  const { version } = await fetchLatestBaileysVersion();

  const rt: Runtime = sessions.get(botId) ?? {
    status: 'CONNECTING',
    tenantId,
    stopping: false,
    reconnectAttempts: 0,
  };
  rt.status = 'CONNECTING';
  rt.tenantId = tenantId;
  rt.stopping = false;
  sessions.set(botId, rt);
  await setBotStatus(tenantId, botId, 'CONNECTING');

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    browser: Browsers.ubuntu('converflow.ai'),
    logger: baileysLogger,
  });
  rt.sock = sock;

  sock.ev.on('creds.update', () => {
    void saveCreds();
  });

  sock.ev.on('connection.update', (update) => {
    void handleConnectionUpdate(botId, tenantId, rt, update, clear);
  });

  sock.ev.on('messages.upsert', (upsert) => {
    void handleIncomingMessages(botId, tenantId, upsert).catch((err) =>
      logger.warn({ err, botId }, 'inbound handler error'),
    );
  });
}

async function handleConnectionUpdate(
  botId: string,
  tenantId: string,
  rt: Runtime,
  update: Partial<{
    connection: string;
    lastDisconnect: { error?: unknown };
    qr: string;
  }>,
  clear: () => Promise<void>,
): Promise<void> {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    try {
      rt.qr = await QRCode.toDataURL(qr);
      rt.status = 'AWAITING_QR';
      await setBotStatus(tenantId, botId, 'AWAITING_QR');
    } catch (err) {
      logger.warn({ err, botId }, 'failed to render QR');
    }
  }

  if (connection === 'open') {
    rt.status = 'CONNECTED';
    rt.qr = undefined;
    rt.reconnectAttempts = 0;
    await setBotStatus(tenantId, botId, 'CONNECTED', { connected: true });
    logger.info({ botId }, 'connected');
  }

  if (connection === 'close') {
    const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
      ?.output?.statusCode;

    if (rt.stopping) {
      sessions.delete(botId);
      return;
    }

    if (statusCode === DisconnectReason.loggedOut) {
      // Device logged out / unlinked on the phone — creds are useless, drop them.
      await clear();
      rt.status = 'DISCONNECTED';
      await setBotStatus(tenantId, botId, 'DISCONNECTED', { disconnectReason: 'logged_out' });
      sessions.delete(botId);
      return;
    }

    rt.reconnectAttempts += 1;
    if (rt.reconnectAttempts > MAX_RECONNECTS) {
      rt.status = 'ERROR';
      await setBotStatus(tenantId, botId, 'ERROR', {
        disconnectReason: `reconnect_failed:${statusCode ?? 'unknown'}`,
      });
      sessions.delete(botId);
      return;
    }

    rt.status = 'CONNECTING';
    const delayMs = Math.min(30_000, 2_000 * rt.reconnectAttempts);
    logger.warn({ botId, statusCode, attempt: rt.reconnectAttempts }, 'reconnecting');
    setTimeout(() => {
      void connect(botId, tenantId).catch((err) =>
        logger.error({ err, botId }, 'reconnect failed'),
      );
    }, delayMs);
  }
}

/** On boot, reconnect bots that were CONNECTED before the runner restarted. */
export async function reconnectAll(): Promise<void> {
  const bots = await listReconnectableBots();
  logger.info({ count: bots.length }, 'reconnecting bots on boot');
  for (const b of bots) {
    void connect(b.id, b.tenantId).catch((err) =>
      logger.error({ err, botId: b.id }, 'boot reconnect failed'),
    );
  }
}
