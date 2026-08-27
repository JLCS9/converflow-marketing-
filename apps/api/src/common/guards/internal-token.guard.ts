import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@converflow/shared';
import { env } from '../../config/env.js';
import { safeHashEquals } from '../auth/api-key.util.js';

/**
 * Protects internal-only routes (e.g. the bot-runner → API inbound webhook).
 * Authenticated with the shared BOT_RUNNER_INTERNAL_TOKEN. If the token is not
 * configured on the server, all internal routes are denied (fail closed).
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const raw = req.headers['x-internal-token'];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    const expected = env.BOT_RUNNER_INTERNAL_TOKEN;
    // Constant-time compare: a plain `!==` leaks the secret byte by byte to a
    // caller that can measure response times.
    if (!expected || !provided || !safeHashEquals(provided, expected)) {
      throw new UnauthorizedError('internal token inválido');
    }
    return true;
  }
}
