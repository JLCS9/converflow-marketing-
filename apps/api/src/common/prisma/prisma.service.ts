import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { prisma, withTenant, withRlsBypass, type PrismaClient } from '@converflow/db';

/**
 * Wraps the shared Prisma client and exposes tenant-scoping helpers.
 *
 * IMPORTANT: never use `service.raw.<model>` directly inside a request — always
 * go through `withTenant(...)` so the tenant_id is set on the connection and
 * RLS is enforced. The `raw` accessor exists only for bootstrap, migrations,
 * and explicit admin contexts via `bypass(...)`.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly raw: PrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    await this.raw.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.raw.$disconnect();
  }

  withTenant<T>(
    tenantId: string,
    fn: Parameters<typeof withTenant<T>>[2],
  ): Promise<T> {
    return withTenant<T>(this.raw, tenantId, fn);
  }

  bypass<T>(fn: Parameters<typeof withRlsBypass<T>>[1]): Promise<T> {
    return withRlsBypass<T>(this.raw, fn);
  }
}
