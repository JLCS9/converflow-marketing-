import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import {
  ConflictError,
  createTenantSchema,
  updateTenantLimitsSchema,
  type CreateTenantInput,
  type UpdateTenantLimitsInput,
} from '@converflow/shared';
import type { Tenant } from '@converflow/db';
import { PrismaService } from '../../common/prisma/prisma.service.js';

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  status: Tenant['status'];
  maxUsers: number;
  maxBots: number;
  kitDigitalSegment: string | null;
  createdAt: Date;
  _count: { users: number; bots: number };
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  list(opts: { limit?: number; offset?: number } = {}): Promise<TenantListItem[]> {
    return this.prisma.bypass(async (tx) =>
      tx.tenant.findMany({
        take: opts.limit ?? 50,
        skip: opts.offset ?? 0,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          maxUsers: true,
          maxBots: true,
          kitDigitalSegment: true,
          createdAt: true,
          _count: { select: { users: true, bots: true } },
        },
      }),
    );
  }

  async create(
    input: CreateTenantInput,
    adminId: string,
  ): Promise<{ tenant: Tenant; ownerTempPassword: string }> {
    const data = createTenantSchema.parse(input);

    const conflict = await this.prisma.bypass(async (tx) =>
      tx.tenant.findUnique({ where: { slug: data.slug } }),
    );
    if (conflict) throw new ConflictError('Slug ya en uso', { field: 'slug' });

    const tempPassword = randomBytes(12).toString('base64url');
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

    const tenant = await this.prisma.bypass(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          kitDigitalSegment: data.kitDigitalSegment,
          status: 'ACTIVE',
          users: {
            create: {
              email: data.ownerEmail,
              name: data.ownerName,
              passwordHash,
              role: 'OWNER',
              status: 'ACTIVE',
            },
          },
        },
      });
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: 'create_tenant',
          targetType: 'tenant',
          targetId: t.id,
          metadata: { slug: t.slug, ownerEmail: data.ownerEmail },
        },
      });
      return t;
    });

    // TODO: send invitation email instead of returning password in the response.
    return { tenant, ownerTempPassword: tempPassword };
  }

  async updateLimits(
    tenantId: string,
    input: UpdateTenantLimitsInput,
    adminId: string,
  ): Promise<Tenant> {
    const data = updateTenantLimitsSchema.parse(input);
    const updated = await this.prisma.bypass(async (tx) => {
      const t = await tx.tenant.update({ where: { id: tenantId }, data });
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: 'update_limits',
          targetType: 'tenant',
          targetId: tenantId,
          metadata: data,
        },
      });
      return t;
    });
    return updated;
  }
}
