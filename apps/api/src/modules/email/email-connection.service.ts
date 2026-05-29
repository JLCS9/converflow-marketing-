import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { encryptSecret } from '../../common/utils/crypto.js';

const connectSchema = z.object({
  email: z.string().trim().email().max(160),
  imapHost: z.string().trim().min(1).max(160),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  smtpHost: z.string().trim().min(1).max(160),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(465),
  username: z.string().trim().min(1).max(160),
  password: z.string().min(1).max(400),
  secure: z.coerce.boolean().default(true),
});

@Injectable()
export class EmailConnectionService {
  private readonly logger = new Logger(EmailConnectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async connect(tenantId: string, botId: string, input: unknown) {
    const data = connectSchema.parse(input);

    const bot = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bot.findUnique({ where: { id: botId }, select: { id: true, channel: true } }),
    );
    if (!bot) throw new NotFoundError('Bot no encontrado');
    if (bot.channel !== 'EMAIL') throw new BadRequestError('El bot no es de canal Email');

    // Verify SMTP credentials before saving (fast feedback on bad password).
    try {
      const transporter = nodemailer.createTransport({
        host: data.smtpHost,
        port: data.smtpPort,
        secure: data.secure,
        auth: { user: data.username, pass: data.password },
      });
      await transporter.verify();
    } catch (err) {
      this.logger.warn({ err }, 'SMTP verify failed');
      throw new BadRequestError(
        'No se pudo conectar al servidor SMTP. Revisa el servidor, puerto y la contraseña (usa una contraseña de aplicación si tu proveedor la exige).',
      );
    }

    const email = data.email.trim().toLowerCase();
    const passwordEnc = encryptSecret(data.password);

    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.emailConnection.upsert({
        where: { botId },
        create: {
          tenantId,
          botId,
          email,
          imapHost: data.imapHost,
          imapPort: data.imapPort,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          username: data.username,
          passwordEnc,
          secure: data.secure,
          status: 'CONNECTED',
        },
        update: {
          email,
          imapHost: data.imapHost,
          imapPort: data.imapPort,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          username: data.username,
          passwordEnc,
          secure: data.secure,
          status: 'CONNECTED',
          lastError: null,
        },
      });
      await tx.bot.update({
        where: { id: botId },
        data: { phoneNumber: email, status: 'CONNECTED', lastConnectedAt: new Date() },
      });
    });

    return { connected: true, email };
  }

  async status(tenantId: string, botId: string) {
    const conn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailConnection.findUnique({ where: { botId } }),
    );
    return {
      connected: !!conn,
      email: conn?.email ?? null,
      status: conn?.status ?? null,
      lastError: conn?.lastError ?? null,
    };
  }

  async disconnect(tenantId: string, botId: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.emailConnection.deleteMany({ where: { botId } });
      await tx.bot.updateMany({ where: { id: botId }, data: { status: 'DISCONNECTED' } });
    });
    return { ok: true };
  }
}
