/**
 * Apply RLS policies after Prisma migrations.
 *
 * Run automatically as part of `pnpm db:migrate` via npm script,
 * or manually: `pnpm --filter @converflow/db apply:rls`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

async function main() {
  const sqlPath = join(__dirname, 'sql', 'rls-policies.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const prisma = new PrismaClient();
  try {
    console.info('Applying RLS policies...');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL app.bypass_rls = 'on'");
      await tx.$executeRawUnsafe(sql);
    });
    console.info('RLS policies applied successfully.');
  } catch (err) {
    console.error('Failed to apply RLS policies:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
