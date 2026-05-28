import { proto, type BaileysEventMap } from 'baileys';
import pino from 'pino';

/**
 * Forwards inbound WhatsApp messages to the API internal webhook, which
 * find-or-creates the lead, stores the message as a Note, and classifies it.
 * The bot-runner stays a thin transport — no business/AI logic here.
 */
const logger = pino({ name: 'bot-runner-inbound', level: process.env.BOT_RUNNER_LOG_LEVEL ?? 'warn' });
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

async function postInbound(
  botId: string,
  payload: { tenantId: string; fromPhone: string; pushName?: string; text: string },
): Promise<void> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/internal/bots/${botId}/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': internalToken },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.warn({ botId, status: res.status }, 'inbound webhook non-2xx');
    }
  } catch (err) {
    logger.warn({ err, botId }, 'inbound webhook request failed');
  }
}

export async function handleIncomingMessages(
  botId: string,
  tenantId: string,
  upsert: BaileysEventMap['messages.upsert'],
): Promise<void> {
  // 'notify' = live messages. Ignore 'append' (history sync / our own edits).
  if (upsert.type !== 'notify') return;

  for (const msg of upsert.messages) {
    const jid = msg.key?.remoteJid ?? '';
    // Only 1:1 chats for now — skip groups (@g.us), status/broadcast, and our own.
    if (!jid || msg.key?.fromMe || !jid.endsWith('@s.whatsapp.net')) continue;

    const fromPhone = jid.split('@')[0] ?? '';
    if (!fromPhone) continue;

    const text = extractText(msg.message).trim();
    await postInbound(botId, {
      tenantId,
      fromPhone,
      pushName: msg.pushName ?? undefined,
      text,
    });
  }
}
