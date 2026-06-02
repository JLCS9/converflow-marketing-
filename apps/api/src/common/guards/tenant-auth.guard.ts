import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  UnauthorizedError,
  effectivePermissions,
  type UserRole,
} from '@converflow/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashSessionToken } from '../auth/session.util.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

export const TENANT_SESSION_COOKIE = 'cf_tenant_session';

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { cookies?: Record<string, string>; user?: AuthenticatedUser }>();

    const token = req.cookies?.[TENANT_SESSION_COOKIE];
    if (!token) throw new UnauthorizedError();

    const hash = hashSessionToken(token);
    const session = await this.prisma.bypass(async (tx) =>
      tx.userSession.findUnique({
        where: { token: hash },
        include: { user: true },
      }),
    );

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError();
    }

    // Resolve effective permissions once per request so downstream guards
    // and controllers don't need to re-query the DB.
    const rawPerms = session.user.permissions as unknown;
    const permsArray = Array.isArray(rawPerms) ? (rawPerms as string[]) : null;
    const permissions = effectivePermissions(
      session.user.role as UserRole,
      permsArray,
    );

    req.user = {
      userId: session.userId,
      tenantId: session.tenantId,
      email: session.user.email,
      role: session.user.role,
      permissions,
    };

    return true;
  }
}
