import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { PermissionModule } from '@converflow/shared';
import { REQUIRE_PERM_KEY } from '../decorators/require-perm.decorator.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

/**
 * Enforces the @RequirePerm() metadata against the authenticated user's
 * effective permissions (resolved upstream in TenantAuthGuard).
 *
 * Must always run AFTER TenantAuthGuard (NestJS executes guards in the
 * order they are declared). When no metadata is present the guard is a
 * no-op so it's safe to apply globally if desired.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionModule[] | undefined>(
      REQUIRE_PERM_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) {
      // Should never happen — guard ordering issue. Be loud about it.
      throw new ForbiddenException('Auth context missing — guard order wrong');
    }

    // OWNER bypass + explicit subset check.
    if (user.role === 'OWNER') return true;
    const have = new Set(user.permissions);
    for (const m of required) {
      if (!have.has(m)) {
        throw new ForbiddenException(
          `Tu rol no incluye el permiso "${m}". Pide al propietario que lo habilite.`,
        );
      }
    }
    return true;
  }
}
