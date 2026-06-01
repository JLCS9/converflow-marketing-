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

const DEFAULT_STAGES: Array<{
  key: string;
  label: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  oppStatus: 'OPEN' | 'QUOTED' | 'NEGOTIATING' | 'WON' | 'LOST';
}> = [
  { key: 'OPEN', label: 'Abierta', color: '#64748B', order: 0, isWon: false, isLost: false, oppStatus: 'OPEN' },
  { key: 'QUOTED', label: 'Propuesta enviada', color: '#3B82F6', order: 1, isWon: false, isLost: false, oppStatus: 'QUOTED' },
  { key: 'NEGOTIATING', label: 'Negociación', color: '#F59E0B', order: 2, isWon: false, isLost: false, oppStatus: 'NEGOTIATING' },
  { key: 'WON', label: 'Ganada', color: '#16A34A', order: 3, isWon: true, isLost: false, oppStatus: 'WON' },
  { key: 'LOST', label: 'Perdida', color: '#DC2626', order: 4, isWon: false, isLost: true, oppStatus: 'LOST' },
];

async function seedDefaultPipelines() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);

    const tenants = await tx.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      let pipeline = await tx.pipeline.findFirst({
        where: { tenantId: tenant.id, entityType: 'OPPORTUNITY', isDefault: true },
      });
      if (!pipeline) {
        pipeline = await tx.pipeline.create({
          data: {
            tenantId: tenant.id,
            name: 'Tablero estándar',
            entityType: 'OPPORTUNITY',
            isDefault: true,
          },
        });
      }
      for (const stage of DEFAULT_STAGES) {
        await tx.pipelineStage.upsert({
          where: { pipelineId_key: { pipelineId: pipeline.id, key: stage.key } },
          update: {
            label: stage.label,
            color: stage.color,
            order: stage.order,
            isWon: stage.isWon,
            isLost: stage.isLost,
          },
          create: {
            tenantId: tenant.id,
            pipelineId: pipeline.id,
            key: stage.key,
            label: stage.label,
            color: stage.color,
            order: stage.order,
            isWon: stage.isWon,
            isLost: stage.isLost,
          },
        });
      }

      const stages = await tx.pipelineStage.findMany({
        where: { pipelineId: pipeline.id },
      });
      const byOppStatus = new Map(
        DEFAULT_STAGES.map((s) => [s.oppStatus, stages.find((x) => x.key === s.key)!.id]),
      );

      const orphaned = await tx.opportunity.findMany({
        where: { tenantId: tenant.id, stageId: null },
        select: { id: true, status: true },
      });
      for (const opp of orphaned) {
        const stageId = byOppStatus.get(opp.status);
        if (!stageId) continue;
        await tx.opportunity.update({
          where: { id: opp.id },
          data: { pipelineId: pipeline.id, stageId },
        });
      }
    }
  });
  console.info('Default pipelines + stages seeded for all tenants.');
}

async function migrateLeadStatuses() {
  // Map the legacy 5-state model to the new 3-state model. Idempotent and safe
  // to re-run: rows that already use LEAD / CLIENT / LOST are not touched.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const a = await tx.lead.updateMany({
      where: { status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] } },
      data: { status: 'LEAD' },
    });
    const b = await tx.lead.updateMany({
      where: { status: 'CONVERTED' },
      data: { status: 'CLIENT' },
    });
    return { toLead: a.count, toClient: b.count };
  });
  if (result.toLead || result.toClient) {
    console.info(
      `Migrated lead statuses: ${result.toLead} → LEAD, ${result.toClient} → CLIENT.`,
    );
  } else {
    console.info('Lead statuses already on the new model — nothing to migrate.');
  }
}

async function main() {
  try {
    await seedSuperAdmin();
    await seedFirstAppVersion();
    await seedDefaultPipelines();
    await migrateLeadStatuses();
  } finally {
    await prisma.$disconnect();
  }
}

void main();
