import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  UnauthorizedError,
  effectivePermissions,
  type PermissionModule,
  type UserRole,
} from '@converflow/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashSessionToken } from '../auth/session.util.js';
import {
  extractBearerApiKey,
  hashApiKey,
  safeHashEquals,
} from '../auth/api-key.util.js';
import { TENANT_SESSION_COOKIE } from './tenant-auth.guard.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

/**
 * Hybrid auth guard for endpoints that may be hit either by the web app
 * (cookie session) or by a third-party integration (Bearer cfai_*).
 *
 * Strategy:
 *  1. If `Authorization: Bearer cfai_*` is present, validate the key and
 *     populate `req.user` with role=`API_KEY` and permissions=key.scopes.
 *  2. Otherwise fall back to the tenant cookie like TenantAuthGuard.
 *  3. If neither matches, 401.
 *
 * The downstream PermissionsGuard then enforces @RequirePerm() against
 * `req.user.permissions` as usual — so API keys with fewer scopes
 * naturally see a 403 from the same enforcement layer.
 */
@Injectable()
export class TenantOrApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<
        FastifyRequest & {
          cookies?: Record<string, string>;
          user?: AuthenticatedUser;
        }
      >();

    const authHeader = req.headers['authorization'];
    const bearer = extractBearerApiKey(
      Array.isArray(authHeader) ? authHeader[0] : authHeader,
    );

    if (bearer) {
      // === API key path ===
      const prefix = bearer.slice(0, 10);
      const key = await this.prisma.bypass((tx) =>
        tx.apiKey.findUnique({ where: { prefix } }),
      );
      if (!key) throw new UnauthorizedError();
      if (key.revokedAt) throw new UnauthorizedError();
      if (key.expiresAt && key.expiresAt < new Date()) {
        throw new UnauthorizedError();
      }
      const expected = hashApiKey(bearer);
      if (!safeHashEquals(expected, key.keyHash)) {
        throw new UnauthorizedError();
      }
      // Touch lastUsedAt fire-and-forget; failures must not block the
      // request from reaching the handler.
      void this.prisma
        .bypass((tx) =>
          tx.apiKey.update({
            where: { id: key.id },
            data: { lastUsedAt: new Date() },
          }),
        )
        .catch(() => {
          /* swallow */
        });

      const scopes = Array.isArray(key.scopes)
        ? (key.scopes as PermissionModule[])
        : [];
      req.user = {
        userId: `apikey:${key.id}`,
        tenantId: key.tenantId,
        email: `apikey:${key.prefix}`,
        role: 'API_KEY',
        permissions: scopes,
      };
      return true;
    }

    // === Cookie session path ===
    const token = req.cookies?.[TENANT_SESSION_COOKIE];
    if (!token) throw new UnauthorizedError();
    const hash = hashSessionToken(token);
    const session = await this.prisma.bypass((tx) =>
      tx.userSession.findUnique({
        where: { token: hash },
        include: { user: true },
      }),
    );
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError();
    }
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
