import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import {
  ConflictError,
  NotFoundError,
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

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  status: Tenant['status'];
  maxUsers: number;
  maxBots: number;
  maxConversationsPerMonth: number;
  maxStorageGb: number;
  kitDigitalSegment: string | null;
  kitDigitalActivatedAt: Date | null;
  contactEmail: string;
  contactPhone: string | null;
  timezone: string;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
  suspendedAt: Date | null;
  _count: { users: number; bots: number; agents: number; accessLogs: number };
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TenantDetail> {
    const tenant = await this.prisma.bypass(async (tx) =>
      tx.tenant.findUnique({
        where: { id },
        include: { _count: { select: { users: true, bots: true, agents: true, accessLogs: true } } },
      }),
    );
    if (!tenant) throw new NotFoundError('Tenant no encontrado');
    return tenant;
  }

  async stats(): Promise<{
    tenants: { total: number; active: number; trial: number; suspended: number };
    users: number;
    bots: number;
    accessLogsLast24h: number;
  }> {
    return this.prisma.bypass(async (tx) => {
      const [tenantsByStatus, users, bots, recentLogs] = await Promise.all([
        tx.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
        tx.user.count(),
        tx.bot.count(),
        tx.accessLog.count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
      ]);
      const counts = { total: 0, active: 0, trial: 0, suspended: 0 };
      for (const row of tenantsByStatus) {
        counts.total += row._count._all;
        if (row.status === 'ACTIVE') counts.active = row._count._all;
        if (row.status === 'TRIAL') counts.trial = row._count._all;
        if (row.status === 'SUSPENDED') counts.suspended = row._count._all;
      }
      return { tenants: counts, users, bots, accessLogsLast24h: recentLogs };
    });
  }

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

    // Slug must be unique platform-wide.
    const slugConflict = await this.prisma.bypass(async (tx) =>
      tx.tenant.findUnique({ where: { slug: data.slug } }),
    );
    if (slugConflict) throw new ConflictError('Slug ya en uso', { field: 'slug' });

    // Owner email must be globally unique (Option B — same person can't be
    // owner of two tenants under the same email; avoids login ambiguity).
    const emailConflict = await this.prisma.bypass(async (tx) =>
      tx.user.findFirst({ where: { email: data.ownerEmail } }),
    );
    if (emailConflict)
      throw new ConflictError(
        `Ya existe un usuario con email ${data.ownerEmail} en otro tenant`,
        { field: 'ownerEmail' },
      );

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

  async remove(tenantId: string, adminId: string): Promise<{ id: string; slug: string }> {
    return this.prisma.bypass(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundError('Tenant no encontrado');

      // Cascade deletes (users, bots, agents, sessions, access_logs, etc) are
      // handled by Prisma onDelete: Cascade declarations in the schema.
      await tx.tenant.delete({ where: { id: tenantId } });

      await tx.adminActionLog.create({
        data: {
          adminId,
          action: 'delete_tenant',
          targetType: 'tenant',
          targetId: tenantId,
          metadata: { slug: tenant.slug, name: tenant.name },
        },
      });

      return { id: tenant.id, slug: tenant.slug };
    });
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
