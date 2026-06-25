import { Injectable, Logger } from '@nestjs/common';
import {
  NotFoundError,
  AppError,
  createMailConnectionSchema,
  updateMailConnectionSchema,
  type CreateMailConnectionInput,
  type UpdateMailConnectionInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { encryptSecret, decryptSecret } from '../../common/utils/crypto.js';
import { createMailDriver, type DriverConfig } from './drivers/index.js';

interface Actor {
  userId: string;
  role: string;
}

// Fields safe to return to the client — NEVER includes secretEnc.
const SAFE_SELECT = {
  id: true,
  driver: true,
  fromAddress: true,
  displayName: true,
  signature: true,
  imapHost: true,
  imapPort: true,
  smtpHost: true,
  smtpPort: true,
  username: true,
  secure: true,
  visibility: true,
  ownerUserId: true,
  status: true,
  lastError: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class MailConnectionsService {
  private readonly logger = new Logger(MailConnectionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Connections the actor may see: all SHARED + their own PRIVATE. */
  list(tenantId: string, actor: Actor) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.findMany({
        where: {
          OR: [{ visibility: 'SHARED' }, { visibility: 'PRIVATE', ownerUserId: actor.userId }],
        },
        orderBy: { createdAt: 'desc' },
        select: SAFE_SELECT,
      }),
    );
  }

  async get(tenantId: string, id: string, actor: Actor) {
    const conn = await this.fetchAccessible(tenantId, id, actor);
    return this.toSafe(conn);
  }

  async create(tenantId: string, actor: Actor, input: CreateMailConnectionInput) {
    const data = createMailConnectionSchema.parse(input);
    const created = await this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.create({
        data: {
          tenantId,
          driver: data.driver,
          fromAddress: data.fromAddress,
          displayName: data.displayName,
          signature: data.signature,
          imapHost: data.imapHost,
          imapPort: data.imapPort,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          username: data.username,
          secure: data.secure ?? true,
          secretEnc: data.secret ? encryptSecret(data.secret) : null,
          visibility: data.visibility,
          // PRIVATE is always owned by its creator — enforced server-side.
          ownerUserId: data.visibility === 'PRIVATE' ? actor.userId : null,
          createdByUserId: actor.userId,
          status: 'PENDING',
        },
        select: SAFE_SELECT,
      }),
    );
    // Verify connectivity (no txn — network I/O); reflect status, don't fail the create.
    await this.verifyAndUpdateStatus(tenantId, created.id).catch(() => undefined);
    return this.get(tenantId, created.id, actor);
  }

  async update(tenantId: string, id: string, actor: Actor, input: UpdateMailConnectionInput) {
    const data = updateMailConnectionSchema.parse(input);
    await this.fetchAccessible(tenantId, id, actor); // access check
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.update({
        where: { id },
        data: {
          displayName: data.displayName === undefined ? undefined : data.displayName,
          signature: data.signature === undefined ? undefined : data.signature,
          visibility: data.visibility,
          ownerUserId: data.visibility ? (data.visibility === 'PRIVATE' ? actor.userId : null) : undefined,
          imapHost: data.imapHost,
          imapPort: data.imapPort,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          username: data.username,
          secure: data.secure,
          // Only re-encrypt the secret when a new one is provided.
          secretEnc: data.secret ? encryptSecret(data.secret) : undefined,
        },
      }),
    );
    await this.verifyAndUpdateStatus(tenantId, id).catch(() => undefined);
    return this.get(tenantId, id, actor);
  }

  async remove(tenantId: string, id: string, actor: Actor) {
    await this.fetchAccessible(tenantId, id, actor);
    await this.prisma.withTenant(tenantId, (tx) => tx.mailConnection.delete({ where: { id } }));
  }

  /** Send a test email through the connection to `to`. */
  async testSend(tenantId: string, id: string, actor: Actor, to: string) {
    const cfg = await this.driverConfig(tenantId, id, actor);
    const driver = createMailDriver(cfg);
    try {
      const res = await driver.send({
        to,
        subject: `[Prueba] Conexión de correo · ${cfg.fromAddress}`,
        text: `Esto es un correo de prueba enviado desde Converflow usando la conexión ${cfg.fromAddress}.`,
        html: `<p>Esto es un correo de prueba enviado desde Converflow usando la conexión <strong>${cfg.fromAddress}</strong>.</p>`,
      });
      await this.setStatus(tenantId, id, 'CONNECTED', null);
      return { ok: true, messageId: res.id };
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 300);
      await this.setStatus(tenantId, id, 'ERROR', msg);
      throw new AppError('INTERNAL', `No se pudo enviar la prueba: ${msg}`, 502);
    }
  }

  /** Verify + fetch the most recent INBOX messages (connectivity proof). */
  async testSync(tenantId: string, id: string, actor: Actor) {
    const cfg = await this.driverConfig(tenantId, id, actor);
    const driver = createMailDriver(cfg);
    try {
      await driver.verify();
      const recent = await driver.fetchRecent(5);
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.mailConnection.update({
          where: { id },
          data: { status: 'CONNECTED', lastError: null, lastSyncedAt: new Date() },
        }),
      );
      return { ok: true, recent };
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 300);
      await this.setStatus(tenantId, id, 'ERROR', msg);
      throw new AppError('INTERNAL', `No se pudo conectar/sincronizar: ${msg}`, 502);
    }
  }

  // ---- internals ----------------------------------------------------------

  /** Load a connection enforcing visibility: PRIVATE is owner-only. */
  private async fetchAccessible(tenantId: string, id: string, actor: Actor) {
    const conn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.findUnique({ where: { id } }),
    );
    // 404 (not 403) for private boxes the actor doesn't own — don't reveal existence.
    if (!conn || (conn.visibility === 'PRIVATE' && conn.ownerUserId !== actor.userId)) {
      throw new NotFoundError('Conexión de correo no encontrada');
    }
    return conn;
  }

  private async driverConfig(tenantId: string, id: string, actor: Actor): Promise<DriverConfig> {
    const c = await this.fetchAccessible(tenantId, id, actor);
    return {
      driver: c.driver,
      fromAddress: c.fromAddress,
      displayName: c.displayName,
      imapHost: c.imapHost,
      imapPort: c.imapPort,
      smtpHost: c.smtpHost,
      smtpPort: c.smtpPort,
      username: c.username,
      secret: c.secretEnc ? decryptSecret(c.secretEnc) : null,
      secure: c.secure,
    };
  }

  private async verifyAndUpdateStatus(tenantId: string, id: string) {
    const conn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.findUnique({ where: { id } }),
    );
    if (!conn) return;
    try {
      await createMailDriver({
        driver: conn.driver,
        fromAddress: conn.fromAddress,
        displayName: conn.displayName,
        imapHost: conn.imapHost,
        imapPort: conn.imapPort,
        smtpHost: conn.smtpHost,
        smtpPort: conn.smtpPort,
        username: conn.username,
        secret: conn.secretEnc ? decryptSecret(conn.secretEnc) : null,
        secure: conn.secure,
      }).verify();
      await this.setStatus(tenantId, id, 'CONNECTED', null);
    } catch (err) {
      await this.setStatus(tenantId, id, 'ERROR', String((err as Error)?.message ?? err).slice(0, 300));
    }
  }

  private setStatus(tenantId: string, id: string, status: 'CONNECTED' | 'ERROR', lastError: string | null) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.mailConnection.update({ where: { id }, data: { status, lastError } }),
    );
  }

  private toSafe(conn: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(SAFE_SELECT)) out[k] = conn[k];
    return out;
  }
}
