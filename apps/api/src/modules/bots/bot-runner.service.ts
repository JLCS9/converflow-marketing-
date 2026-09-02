import { Injectable } from '@nestjs/common';
import { AppError } from '@converflow/shared';
import { env } from '../../config/env.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { WhatsappCloudService } from '../channels/whatsapp-cloud/whatsapp-cloud.service.js';

export interface BotRuntimeState {
  status: string;
  qr: string | null;
}

/**
 * Thin HTTP client to the bot-runner internal API (Docker network only,
 * authenticated with the shared x-internal-token).
 */
@Injectable()
export class BotRunnerService {
  private readonly base = env.BOT_RUNNER_URL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloud: WhatsappCloudService,
  ) {}

  /** F2 · Punto de corte del transporte: bot con waPhoneNumberId → Cloud API. */
  private async cloudPhoneId(botId: string): Promise<string | null> {
    const bot = await this.prisma.bypass((tx) =>
      tx.bot.findUnique({ where: { id: botId }, select: { waPhoneNumberId: true } }),
    );
    return bot?.waPhoneNumberId ?? null;
  }

  start(botId: string, tenantId: string): Promise<{ status: string }> {
    return this.call(`/bots/${botId}/start`, 'POST', { tenantId });
  }

  stop(botId: string): Promise<{ ok: boolean }> {
    return this.call(`/bots/${botId}/stop`, 'POST');
  }

  state(botId: string): Promise<BotRuntimeState> {
    return this.call(`/bots/${botId}/state`, 'GET');
  }

  async sendText(botId: string, jid: string, text: string): Promise<{ ok: boolean; id?: string }> {
    const phoneId = await this.cloudPhoneId(botId);
    if (phoneId) {
      const to = `+${jid.split('@')[0]!.replace(/\D/g, '')}`;
      const res = await this.cloud.sendText(phoneId, to, text);
      return { ok: true, id: res.id };
    }
    return this.call(`/bots/${botId}/send`, 'POST', { jid, text });
  }

  sendDocument(
    botId: string,
    jid: string,
    doc: { url: string; fileName: string; mimetype: string },
  ): Promise<{ ok: boolean; id?: string }> {
    return this.call(`/bots/${botId}/send-document`, 'POST', { jid, ...doc });
  }

  private async call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          'x-internal-token': env.BOT_RUNNER_INTERNAL_TOKEN ?? '',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new AppError('INTERNAL', 'No se pudo contactar con el bot-runner', 502, {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
    if (!res.ok) {
      throw new AppError('INTERNAL', `bot-runner ${path} respondió ${res.status}`, 502);
    }
    return res.json() as Promise<T>;
  }
}
