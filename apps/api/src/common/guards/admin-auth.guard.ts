import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@converflow/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashSessionToken } from '../auth/session.util.js';
import type { AuthenticatedAdmin } from '../decorators/current-user.decorator.js';

export const ADMIN_SESSION_COOKIE = 'cf_admin_session';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<
        FastifyRequest & { cookies?: Record<string, string>; admin?: AuthenticatedAdmin }
      >();

    const token = req.cookies?.[ADMIN_SESSION_COOKIE];
    if (!token) throw new UnauthorizedError();

    const hash = hashSessionToken(token);
    const session = await this.prisma.bypass(async (tx) =>
      tx.platformAdminSession.findUnique({
        where: { token: hash },
        include: { admin: true },
      }),
    );

    if (!session || session.expiresAt < new Date() || session.admin.status !== 'ACTIVE') {
      throw new UnauthorizedError();
    }

    req.admin = {
      adminId: session.adminId,
      email: session.admin.email,
    };

    return true;
  }
}
