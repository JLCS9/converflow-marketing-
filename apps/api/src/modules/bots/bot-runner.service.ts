import { Injectable } from '@nestjs/common';
import { AppError } from '@converflow/shared';
import { env } from '../../config/env.js';

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

  start(botId: string, tenantId: string): Promise<{ status: string }> {
    return this.call(`/bots/${botId}/start`, 'POST', { tenantId });
  }

  stop(botId: string): Promise<{ ok: boolean }> {
    return this.call(`/bots/${botId}/stop`, 'POST');
  }

  state(botId: string): Promise<BotRuntimeState> {
    return this.call(`/bots/${botId}/state`, 'GET');
  }

  sendText(botId: string, jid: string, text: string): Promise<{ ok: boolean; id?: string }> {
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
