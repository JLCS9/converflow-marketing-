import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@converflow/shared';
import { env } from '../../config/env.js';

/**
 * Protects internal-only routes (e.g. the bot-runner → API inbound webhook).
 * Authenticated with the shared BOT_RUNNER_INTERNAL_TOKEN. If the token is not
 * configured on the server, all internal routes are denied (fail closed).
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const provided = req.headers['x-internal-token'];
    const expected = env.BOT_RUNNER_INTERNAL_TOKEN;
    if (!expected || provided !== expected) {
      throw new UnauthorizedError('internal token inválido');
    }
    return true;
  }
}
