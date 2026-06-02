import { Injectable } from '@nestjs/common';
import {
  ForbiddenError,
  NotFoundError,
  createApiKeySchema,
  type ApiKeyCreated,
  type ApiKeySummary,
  type CreateApiKeyInput,
  type PermissionModule,
} from '@converflow/shared';
import { Prisma } from '@converflow/db';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { generateApiKey } from '../../common/auth/api-key.util.js';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<ApiKeySummary[]> {
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          prefix: true,
          scopes: true,
          createdBy: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
          lastUsedAt: true,
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      scopes: this.coerceScopes(r.scopes),
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    }));
  }

  async create(
    input: CreateApiKeyInput,
    ctx: { tenantId: string; currentUserId: string; currentUserEmail: string },
  ): Promise<ApiKeyCreated> {
    const data = createApiKeySchema.parse(input);
    const generated = generateApiKey();

    const row = await this.prisma.withTenant(ctx.tenantId, async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          tenantId: ctx.tenantId,
          name: data.name,
          prefix: generated.prefix,
          keyHash: generated.hash,
          scopes: data.scopes as unknown as Prisma.InputJsonValue,
          createdBy: ctx.currentUserId,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        },
      });
      await tx.accessLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.currentUserId,
          email: ctx.currentUserEmail,
          action: 'api_key.create',
          resource: created.id,
          metadata: {
            name: data.name,
            scopes: data.scopes,
            expiresAt: data.expiresAt ?? null,
            prefix: generated.prefix,
          },
        },
      });
      return created;
    });

    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: this.coerceScopes(row.scopes),
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      secret: generated.secret,
    };
  }

  async revoke(
    id: string,
    ctx: { tenantId: string; currentUserId: string; currentUserEmail: string },
  ): Promise<void> {
    return this.prisma.withTenant(ctx.tenantId, async (tx) => {
      const target = await tx.apiKey.findUnique({ where: { id } });
      if (!target) throw new NotFoundError('API key no encontrada');
      if (target.tenantId !== ctx.tenantId) {
        throw new ForbiddenError('No puedes revocar esta API key');
      }
      if (target.revokedAt) return; // idempotent
      await tx.apiKey.update({
        where: { id },
        data: {
          revokedAt: new Date(),
          revokedBy: ctx.currentUserId,
        },
      });
      await tx.accessLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.currentUserId,
          email: ctx.currentUserEmail,
          action: 'api_key.revoke',
          resource: id,
          metadata: { name: target.name, prefix: target.prefix },
        },
      });
    });
  }

  private coerceScopes(raw: unknown): PermissionModule[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is PermissionModule => typeof x === 'string');
  }
}
