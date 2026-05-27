/**
 * Helpers to scope database operations to a tenant via Postgres RLS.
 *
 * Usage:
 *   - For tenant-scoped requests:
 *       await withTenant(prisma, tenantId, async (tx) => {
 *         return tx.user.findMany();
 *       });
 *
 *   - For platform/admin operations that need to ignore RLS:
 *       await withRlsBypass(prisma, async (tx) => {
 *         return tx.tenant.findMany();
 *       });
 *
 * Both helpers wrap the work in a transaction so the SET LOCAL stays scoped.
 */
import type { PrismaClient } from '@prisma/client';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export async function withTenant<T>(
  client: PrismaClient,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error('withTenant requires a non-empty tenantId');
  }
  return client.$transaction(async (tx) => {
    // SET LOCAL only persists for the current transaction
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.tenant_id', $1, true)`,
      tenantId,
    );
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.bypass_rls', 'off', true)`,
    );
    return fn(tx);
  });
}

export async function withRlsBypass<T>(
  client: PrismaClient,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.bypass_rls', 'on', true)`,
    );
    return fn(tx);
  });
}
