/**
 * Singleton Prisma client for converflow-app.
 *
 * Hot-reload safe in dev: reuses the same instance across module reloads.
 * In production each process gets a fresh client.
 */
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __converflowPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });
}

export const prisma: PrismaClient = global.__converflowPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  global.__converflowPrisma = prisma;
}

export { PrismaClient };
