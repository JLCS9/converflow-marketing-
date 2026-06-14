import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { z } from 'zod';
import { Prisma } from '@converflow/db';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TenantLimitReachedError,
  permissionsArraySchema,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { generateReadablePassword } from '../../common/utils/password.js';

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(100),
  role: z.enum(['OWNER', 'ADMIN', 'BUILDER', 'AGENT_USER']).default('AGENT_USER'),
  /**
   * Optional per-user permission override. When null/omitted the user
   * inherits the role's defaults. OWNER ignores this field at runtime.
   */
  permissions: permissionsArraySchema.nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['OWNER', 'ADMIN', 'BUILDER', 'AGENT_USER']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
  /** Same semantics as in invite. Pass null to reset to role defaults. */
  permissions: permissionsArraySchema.nullable().optional(),
});

export type InviteUserInput = z.infer<typeof inviteSchema>;
export type UpdateUserInput = z.infer<typeof updateSchema>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          permissions: true,
          lastLoginAt: true,
          emailVerifiedAt: true,
          createdAt: true,
        },
      }),
    );
  }

  /** Active users only, minimal fields, for assignment pickers. */
  listAssignable(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true },
      }),
    );
  }

  async invite(input: InviteUserInput, ctx: { tenantId: string; currentUserId: string }) {
    const data = inviteSchema.parse(input);

    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
      const userCount = await tx.user.count();
      if (userCount >= tenant.maxUsers) {
        throw new TenantLimitReachedError('users', userCount, tenant.maxUsers);
      }

      // Email is globally unique across tenants. RLS limits this tx to the
      // current tenant, so we use a parallel bypass query to look across all.
      const existingGlobal = await this.prisma.bypass((rawTx) =>
        rawTx.user.findFirst({ where: { email: data.email } }),
      );
      if (existingGlobal) {
        throw new ConflictError('Ya existe un usuario con ese email', { field: 'email' });
      }

      const tempPassword = generateReadablePassword();
      const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

      // OWNER ignores per-user permissions (they always have everything).
      // Store null so the field doesn't accidentally restrict them later.
      const permissionsToStore =
        data.role === 'OWNER' ? null : (data.permissions ?? null);

      const user = await tx.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: data.email,
          name: data.name,
          role: data.role,
          status: 'PENDING',
          passwordHash,
          permissions:
            permissionsToStore === null
              ? Prisma.JsonNull
              : (permissionsToStore as Prisma.InputJsonValue),
        },
      });

      await tx.accessLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.currentUserId,
          email: data.email,
          action: 'invite_user',
          metadata: {
            invitedUserId: user.id,
            role: data.role,
            permissions: permissionsToStore,
          },
        },
      });

      // TODO: send invitation email. For now we surface the temp password in the API
      // response so the inviter can pass it to the new user out-of-band.
      return { user, tempPassword };
    });
  }

  async update(
    userId: string,
    input: UpdateUserInput,
    ctx: { tenantId: string; currentUserId: string; currentUserRole: string },
  ) {
    const data = updateSchema.parse(input);

    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError('Usuario no encontrado');

      // Only OWNER or ADMIN can change role/status/permissions of other users.
      if (
        (data.role || data.status || data.permissions !== undefined) &&
        !['OWNER', 'ADMIN'].includes(ctx.currentUserRole)
      ) {
        throw new ForbiddenError(
          'Solo OWNER/ADMIN pueden cambiar rol, estado o permisos',
        );
      }

      // Don't allow demoting the last OWNER.
      if (target.role === 'OWNER' && data.role && data.role !== 'OWNER') {
        const ownerCount = await tx.user.count({ where: { role: 'OWNER' } });
        if (ownerCount <= 1) {
          throw new ForbiddenError('No puedes quitar el rol al último OWNER');
        }
      }

      // Determine final role and ensure OWNERs never carry restrictive perms.
      const finalRole = data.role ?? target.role;
      const shouldWritePerms =
        finalRole === 'OWNER' || data.permissions !== undefined;
      // null sentinel for Prisma jsonb columns when we want to clear the
      // value (so the user falls back to role defaults at runtime).
      const permissionsValueForPrisma:
        | typeof Prisma.JsonNull
        | Prisma.InputJsonValue =
        finalRole === 'OWNER' || data.permissions === null
          ? Prisma.JsonNull
          : (data.permissions as Prisma.InputJsonValue);

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(shouldWritePerms ? { permissions: permissionsValueForPrisma } : {}),
        },
      });
      await tx.accessLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.currentUserId,
          email: target.email,
          action: 'update_user',
          metadata: { targetId: userId, changes: data },
        },
      });
      return updated;
    });
  }

  async remove(
    userId: string,
    ctx: { tenantId: string; currentUserId: string; currentUserRole: string },
  ) {
    if (!['OWNER', 'ADMIN'].includes(ctx.currentUserRole)) {
      throw new ForbiddenError('Solo OWNER/ADMIN pueden eliminar usuarios');
    }

    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError('Usuario no encontrado');

      if (target.id === ctx.currentUserId) {
        throw new ForbiddenError('No puedes eliminarte a ti mismo');
      }
      if (target.role === 'OWNER') {
        const ownerCount = await tx.user.count({ where: { role: 'OWNER' } });
        if (ownerCount <= 1) {
          throw new ForbiddenError('No puedes eliminar al último OWNER');
        }
      }

      await tx.user.delete({ where: { id: userId } });
      await tx.accessLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.currentUserId,
          email: target.email,
          action: 'delete_user',
          metadata: { targetId: userId, targetEmail: target.email },
        },
      });
    });
  }
}
