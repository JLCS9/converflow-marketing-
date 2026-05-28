import { proto, type BaileysEventMap, type WAMessageKey, type WASocket } from 'baileys';
import pino from 'pino';

/**
 * Forwards WhatsApp messages (inbound AND our own outbound echoes) to the API
 * internal webhook, which upserts the conversation + message and classifies
 * inbound text. The bot-runner stays a thin transport — no business/AI logic.
 *
 * Baileys 7 LID addressing: remoteJid may be `<lid>@lid`; the real phone (PN)
 * comes from `key.remoteJidAlt` (sync) or `lidMapping.getPNForLID()` (async).
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

function detectMediaType(message: proto.IMessage | null | undefined): string | undefined {
  const m = unwrap(message);
  if (!m) return undefined;
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage) return 'document';
  if (m.stickerMessage) return 'sticker';
  if (m.locationMessage) return 'location';
  if (m.contactMessage) return 'contact';
  return undefined;
}

function isNonLeadJid(jid: string): boolean {
  return (
    jid.endsWith('@g.us') || // groups
    jid.endsWith('@newsletter') || // channels
    jid === 'status@broadcast' ||
    jid.endsWith('@broadcast')
  );
}

/**
 * Resolve a stable conversation identity + lead phone for a contact.
 * Prefers the real phone (PN); falls back to the LID.
 */
async function resolveContact(
  sock: WASocket,
  key: WAMessageKey,
): Promise<{ contactJid: string; phone: string; isRealPhone: boolean } | null> {
  const remoteJid = key.remoteJid ?? '';
  if (!remoteJid) return null;

  const pnFromJid = remoteJid.endsWith('@s.whatsapp.net') ? (remoteJid.split('@')[0] ?? '') : '';
  const altJid = key.remoteJidAlt ?? '';
  const pnFromAlt = altJid.endsWith('@s.whatsapp.net') ? (altJid.split('@')[0] ?? '') : '';
  let pn = pnFromJid || pnFromAlt;

  if (!pn && remoteJid.endsWith('@lid')) {
    try {
      const mapped = await sock.signalRepository.lidMapping.getPNForLID(remoteJid);
      if (mapped && mapped.endsWith('@s.whatsapp.net')) pn = mapped.split('@')[0] ?? '';
    } catch (err) {
      logger.warn({ err, remoteJid }, 'getPNForLID failed');
    }
  }

  if (pn) {
    return { contactJid: `${pn}@s.whatsapp.net`, phone: `+${pn}`, isRealPhone: true };
  }
  if (remoteJid.endsWith('@lid')) {
    return { contactJid: remoteJid, phone: remoteJid.split('@')[0] ?? '', isRealPhone: false };
  }
  return null;
}

async function postEvent(
  botId: string,
  payload: Record<string, unknown>,
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
  sock: WASocket,
  botId: string,
  tenantId: string,
  upsert: BaileysEventMap['messages.upsert'],
): Promise<void> {
  logger.info({ botId, type: upsert.type, count: upsert.messages.length }, 'messages.upsert');
  if (upsert.type !== 'notify') return;

  for (const msg of upsert.messages) {
    const jid = msg.key?.remoteJid ?? '';
    if (!jid || isNonLeadJid(jid)) continue;

    const direction = msg.key?.fromMe ? 'OUT' : 'IN';
    const text = extractText(msg.message).trim();
    const mediaType = detectMediaType(msg.message);
    const contact = await resolveContact(sock, msg.key);
    if (!contact) continue;

    logger.info(
      {
        botId,
        direction,
        jid,
        addressingMode: msg.key.addressingMode ?? null,
        contactJid: contact.contactJid,
        isRealPhone: contact.isRealPhone,
        hasText: text.length > 0,
        mediaType: mediaType ?? null,
      },
      'wa message',
    );

    const res = await postEvent(botId, {
      tenantId,
      direction,
      waMessageId: msg.key.id ?? undefined,
      contactJid: contact.contactJid,
      phone: contact.phone,
      isRealPhone: contact.isRealPhone,
      pushName: msg.pushName ?? undefined,
      text,
      mediaType,
    });
    logger.info({ botId, direction, forwarded: res.ok, status: res.status }, 'wa forwarded');
  }
}
