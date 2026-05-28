import { proto, type BaileysEventMap } from 'baileys';
import pino from 'pino';

/**
 * Forwards inbound WhatsApp messages to the API internal webhook, which
 * find-or-creates the lead, stores the message as a Note, and classifies it.
 * The bot-runner stays a thin transport — no business/AI logic here.
 *
 * Verbose by default (info) while we stabilize inbound; lower via
 * BOT_RUNNER_LOG_LEVEL once it's proven in prod.
 */
const logger = pino({ name: 'bot-runner-inbound', level: process.env.BOT_RUNNER_LOG_LEVEL ?? 'info' });
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://api:4000';
const internalToken = process.env.BOT_RUNNER_INTERNAL_TOKEN ?? '';

function unwrap(message: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
  if (!message) return message;
  if (message.ephemeralMessage?.message) return unwrap(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return unwrap(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return unwrap(message.viewOnceMessageV2.message);
  return message;
}

function extractText(message: proto.IMessage | null | undefined): string {
  const m = unwrap(message);
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

// Endpoints we never treat as a lead conversation.
function isNonLeadJid(jid: string): boolean {
  return (
    jid.endsWith('@g.us') || // groups
    jid.endsWith('@newsletter') || // channels
    jid === 'status@broadcast' ||
    jid.endsWith('@broadcast')
  );
}

async function postInbound(
  botId: string,
  payload: { tenantId: string; fromPhone: string; pushName?: string; text: string },
): Promise<{ ok: boolean; status?: number }> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/internal/bots/${botId}/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': internalToken },
      body: JSON.stringify(payload),
    });
    if (!res.ok) logger.warn({ botId, status: res.status }, 'inbound webhook non-2xx');
    return { ok: res.ok, status: res.status };
  } catch (err) {
    logger.warn({ err, botId }, 'inbound webhook request failed');
    return { ok: false };
  }
}

export async function handleIncomingMessages(
  botId: string,
  tenantId: string,
  upsert: BaileysEventMap['messages.upsert'],
): Promise<void> {
  logger.info({ botId, type: upsert.type, count: upsert.messages.length }, 'messages.upsert');
  // 'notify' = live messages. Ignore 'append' (history sync).
  if (upsert.type !== 'notify') return;

  for (const msg of upsert.messages) {
    const jid = msg.key?.remoteJid ?? '';
    const fromMe = msg.key?.fromMe ?? false;
    const text = extractText(msg.message).trim();
    logger.info(
      { botId, jid, fromMe, pushName: msg.pushName ?? null, hasText: text.length > 0 },
      'inbound message',
    );

    if (!jid || fromMe || isNonLeadJid(jid)) continue;

    // For @s.whatsapp.net the local part is the phone. For @lid it's a LID
    // (not a real phone) — still forwarded so the lead is captured + visible;
    // the API stores whatever digits it gets.
    const fromPhone = jid.split('@')[0] ?? '';
    if (!fromPhone) continue;

    const res = await postInbound(botId, {
      tenantId,
      fromPhone,
      pushName: msg.pushName ?? undefined,
      text,
    });
    logger.info({ botId, jid, forwarded: res.ok, status: res.status }, 'inbound forwarded');
  }
}
