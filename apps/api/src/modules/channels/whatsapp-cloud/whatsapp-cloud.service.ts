import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '@converflow/shared';
import { env } from '../../../config/env.js';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Cliente de WhatsApp Meta Cloud API (F2). Sin sesión persistente: webhooks
 * entrantes + REST saliente. Sustituye a Baileys bot a bot (el interruptor
 * es Bot.waPhoneNumberId); la retirada del bot-runner llega en F4 tras la
 * convivencia del piloto.
 */
@Injectable()
export class WhatsappCloudService {
  private readonly logger = new Logger(WhatsappCloudService.name);

  get configured(): boolean {
    return Boolean(env.WHATSAPP_CLOUD_TOKEN);
  }

  /** Verificación de la suscripción del webhook (GET de Meta). */
  verifyChallenge(mode?: string, token?: string, challenge?: string): string {
    if (mode === 'subscribe' && token && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
      return challenge;
    }
    throw new AppError('FORBIDDEN', 'Verificación de webhook rechazada', 403);
  }

  /** Firma X-Hub-Signature-256 de Meta sobre el raw body. */
  verifySignature(rawBody: Buffer, header: string | undefined): boolean {
    if (!env.WHATSAPP_APP_SECRET) return true; // sin secret configurado no se exige (sandbox)
    if (!header?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
    const given = header.slice('sha256='.length);
    const a = Buffer.from(expected, 'hex');
    let b: Buffer;
    try {
      b = Buffer.from(given, 'hex');
    } catch {
      return false;
    }
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Texto libre — solo válido dentro de la ventana de 24h. */
  async sendText(phoneNumberId: string, toE164: string, text: string): Promise<{ id?: string }> {
    return this.post(phoneNumberId, {
      messaging_product: 'whatsapp',
      to: toE164.replace(/^\+/, ''),
      type: 'text',
      text: { body: text, preview_url: false },
    });
  }

  /** Plantilla aprobada — obligatoria fuera de la ventana de 24h. */
  async sendTemplate(
    phoneNumberId: string,
    toE164: string,
    template: { name: string; language: string; bodyParams?: string[] },
  ): Promise<{ id?: string }> {
    return this.post(phoneNumberId, {
      messaging_product: 'whatsapp',
      to: toE164.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components: template.bodyParams?.length
          ? [{ type: 'body', parameters: template.bodyParams.map((t) => ({ type: 'text', text: t })) }]
          : undefined,
      },
    });
  }

  private async post(phoneNumberId: string, body: unknown): Promise<{ id?: string }> {
    if (!this.configured) {
      throw new AppError('INTERNAL', 'WhatsApp Cloud API no está configurado en esta instalación.', 503);
    }
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.WHATSAPP_CLOUD_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      // Detalle al log; mensaje genérico al cliente (mismo criterio que el LLM).
      this.logger.warn({ phoneNumberId, status: res.status, detail }, 'cloud send failed');
      throw new AppError('INTERNAL', 'No se pudo enviar el mensaje de WhatsApp.', 502);
    }
    const data = (await res.json()) as { messages?: { id?: string }[] };
    return { id: data.messages?.[0]?.id };
  }
}
