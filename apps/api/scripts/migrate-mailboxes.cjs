/**
 * Migra los buzones del sistema de correo ANTIGUO (EmailConnection, por bot) al
 * módulo nuevo (MailConnection).
 *
 * No toca contraseñas: los dos sistemas cifran con el mismo `encryptSecret`
 * (AES-256-GCM con ENCRYPTION_KEY), así que el secreto cifrado se copia tal cual
 * de `passwordEnc` a `secretEnc`. Nadie tiene que descifrar nada ni volver a
 * introducir credenciales.
 *
 * Idempotente: si ya existe un MailConnection con esa dirección en ese tenant,
 * lo salta. Por defecto solo SIMULA; hay que pasar --apply para escribir.
 *
 *   node /repo/apps/api/scripts/migrate-mailboxes.local.cjs            → simula
 *   node /repo/apps/api/scripts/migrate-mailboxes.local.cjs --apply    → migra
 */
const { prisma, withRlsBypass } = require('@converflow/db');

const APPLY = process.argv.includes('--apply');

async function main() {
  const legacy = await withRlsBypass(prisma, (tx) =>
    tx.emailConnection.findMany({
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  );

  if (!legacy.length) {
    console.info('No hay buzones en el sistema antiguo. Nada que migrar.');
    await prisma.$disconnect();
    return;
  }

  const existing = await withRlsBypass(prisma, (tx) =>
    tx.mailConnection.findMany({ select: { tenantId: true, fromAddress: true } }),
  );
  const already = new Set(existing.map((m) => m.tenantId + ':' + m.fromAddress.trim().toLowerCase()));

  console.info(APPLY ? '=== MIGRANDO ===\n' : '=== SIMULACION (usa --apply para escribir) ===\n');
  let migrated = 0;
  let skipped = 0;

  for (const c of legacy) {
    const key = c.tenantId + ':' + c.email.trim().toLowerCase();
    const label = c.tenant.name + ' / ' + c.email;

    if (already.has(key)) {
      console.info('  SALTADO   ' + label + '  (ya existe en el modulo nuevo)');
      skipped++;
      continue;
    }

    // smtpSecure/imapSecure se dejan a NULL a proposito: el modulo nuevo los
    // deriva del puerto, que es mas fiable que el flag unico del sistema viejo
    // (ese flag no podia ser correcto para los dos transportes a la vez).
    const data = {
      tenantId: c.tenantId,
      driver: 'SMTP_IMAP',
      fromAddress: c.email.trim().toLowerCase(),
      imapHost: c.imapHost,
      imapPort: c.imapPort,
      smtpHost: c.smtpHost,
      smtpPort: c.smtpPort,
      username: c.username,
      // Mismo cifrado y misma clave: se copia sin descifrar.
      secretEnc: c.passwordEnc,
      // Buzon de bot = buzon de equipo. SHARED conserva esa semantica; PRIVATE
      // lo dejaria accesible solo a una persona, que no es lo que habia.
      visibility: 'SHARED',
      // El sync nuevo tiene backoff propio: si falla, el mismo lo marcara.
      status: 'CONNECTED',
      // Conservar el cursor evita reimportar el historico Y evita saltarse
      // correo que llego mientras tanto.
      syncCursor: c.lastSeenUid,
    };

    console.info(
      '  MIGRAR    ' + label +
      '  (imap ' + (c.imapHost || '?') + ':' + (c.imapPort || '?') +
      ', smtp ' + (c.smtpHost || '?') + ':' + (c.smtpPort || '?') +
      ', cursor ' + (c.lastSeenUid == null ? 'sin fijar' : c.lastSeenUid) + ')',
    );

    if (APPLY) {
      await withRlsBypass(prisma, (tx) => tx.mailConnection.create({ data }));
    }
    migrated++;
  }

  console.info(
    '\n' + (APPLY ? 'Migrados: ' : 'Se migrarian: ') + migrated + '   Saltados: ' + skipped,
  );
  if (!APPLY && migrated > 0) {
    console.info('Nada escrito. Repite con --apply cuando lo veas bien.');
  }
  if (APPLY && migrated > 0) {
    console.info('\nComprueba en Correo -> Ajustes -> Buzones que aparecen y sincronizan.');
    console.info('Los EmailConnection antiguos NO se borran: quedan como respaldo.');
  }
  await prisma.$disconnect();
}

void main();
