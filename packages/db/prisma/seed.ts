/**
 * Seed script — runs once after migrations to bootstrap the platform.
 *
 * Creates:
 *   - The first PlatformAdmin (super admin) using SUPER_ADMIN_BOOTSTRAP_EMAIL.
 *     A temporary password is printed to stdout. The admin must change it
 *     on first login and enroll TOTP 2FA.
 *   - The initial AppVersion entry so the /changelog page is non-empty.
 *
 * Re-runs are idempotent: skips entities that already exist.
 */
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const READABLE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateTempPassword(length = 14): string {
  const max = 256 - (256 % READABLE_ALPHABET.length);
  let result = '';
  while (result.length < length) {
    const bytes = randomBytes(length * 2);
    for (const b of bytes) {
      if (result.length >= length) break;
      if (b >= max) continue;
      result += READABLE_ALPHABET[b % READABLE_ALPHABET.length];
    }
  }
  return result;
}

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL;
  if (!email) {
    console.warn(
      'SUPER_ADMIN_BOOTSTRAP_EMAIL not set — skipping super admin seed.',
    );
    return;
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    console.info(`Super admin ${email} already exists — skipping.`);
    return;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await argon2.hash(tempPassword, {
    type: argon2.argon2id,
  });

  await prisma.platformAdmin.create({
    data: {
      email,
      name: 'Platform Admin',
      passwordHash,
      mustChangePassword: true,
    },
  });

  console.info('===========================================================');
  console.info('SUPER ADMIN CREATED');
  console.info(`  Email:    ${email}`);
  console.info(`  Password: ${tempPassword}`);
  console.info('Change it on first login and enroll TOTP 2FA immediately.');
  console.info('===========================================================');
}

async function seedFirstAppVersion() {
  const existing = await prisma.appVersion.findFirst();
  if (existing) {
    console.info('App version already seeded — skipping.');
    return;
  }
  await prisma.appVersion.create({
    data: {
      version: '0.1.0',
      releasedAt: new Date(),
      title: 'Initial release',
      description:
        'Bootstrap of the converflow.ai platform — multitenant scaffold, super admin, and Kit Digital compliance baseline.',
      highlights: [
        { title: 'Multitenant core', description: 'Pool model with Postgres RLS isolation.' },
        { title: 'Super admin', description: 'Platform-level account with TOTP 2FA and audit log.' },
        { title: 'Access logs', description: 'Every authenticated action recorded for Kit Digital evidence.' },
      ],
    },
  });
  console.info('Seeded initial AppVersion 0.1.0.');
}

async function main() {
  try {
    await seedSuperAdmin();
    await seedFirstAppVersion();
  } finally {
    await prisma.$disconnect();
  }
}

void main();
