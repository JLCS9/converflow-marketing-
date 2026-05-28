import { proto, type BaileysEventMap, type WAMessageKey, type WASocket } from 'baileys';
import pino from 'pino';

/**
 * Forwards inbound WhatsApp messages to the API internal webhook, which
 * find-or-creates the lead, stores the message as a Note, and classifies it.
 * The bot-runner stays a thin transport — no business/AI logic here.
 *
 * Baileys 7 uses LID addressing: a message's remoteJid may be `<lid>@lid`. The
 * real phone (PN) is exposed via `key.remoteJidAlt` (sync) or, as a fallback,
 * `signalRepository.lidMapping.getPNForLID()` (async).
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

function isNonLeadJid(jid: string): boolean {
  return (
    jid.endsWith('@g.us') || // groups
    jid.endsWith('@newsletter') || // channels
    jid === 'status@broadcast' ||
    jid.endsWith('@broadcast')
  );
}

/**
 * Resolve the contact's phone (preferred) or LID fallback identity.
 * Returns the value to store + whether it's a real phone (so we can prefix it).
 */
async function resolveContact(
  sock: WASocket,
  key: WAMessageKey,
): Promise<{ value: string; isRealPhone: boolean } | null> {
  const remoteJid = key.remoteJid ?? '';
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

  if (pn) return { value: `+${pn}`, isRealPhone: true };
  // No PN resolvable → use the LID as a stable contact identity (no prefix).
  if (remoteJid.endsWith('@lid')) return { value: remoteJid.split('@')[0] ?? '', isRealPhone: false };
  return null;
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
  sock: WASocket,
  botId: string,
  tenantId: string,
  upsert: BaileysEventMap['messages.upsert'],
): Promise<void> {
  logger.info({ botId, type: upsert.type, count: upsert.messages.length }, 'messages.upsert');
  if (upsert.type !== 'notify') return;

  for (const msg of upsert.messages) {
    const jid = msg.key?.remoteJid ?? '';
    const fromMe = msg.key?.fromMe ?? false;
    if (!jid || fromMe || isNonLeadJid(jid)) continue;

    const text = extractText(msg.message).trim();
    const contact = await resolveContact(sock, msg.key);
    logger.info(
      {
        botId,
        jid,
        addressingMode: msg.key.addressingMode ?? null,
        resolved: contact?.value ?? null,
        isRealPhone: contact?.isRealPhone ?? false,
        pushName: msg.pushName ?? null,
        hasText: text.length > 0,
      },
      'inbound message',
    );

    if (!contact?.value) continue;

    const res = await postInbound(botId, {
      tenantId,
      fromPhone: contact.value,
      pushName: msg.pushName ?? undefined,
      text,
    });
    logger.info({ botId, jid, forwarded: res.ok, status: res.status }, 'inbound forwarded');
  }
}
