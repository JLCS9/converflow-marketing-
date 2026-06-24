import { Injectable, BadRequestException } from '@nestjs/common';
import {
  NotFoundError,
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  type CreateEmailTemplateInput,
  type UpdateEmailTemplateInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { stripUnsafeHtml, htmlToText } from '../../common/utils/email-html.js';

@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailTemplate.findMany({ orderBy: { updatedAt: 'desc' } }),
    );
  }

  async get(tenantId: string, id: string) {
    const t = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailTemplate.findUnique({ where: { id } }),
    );
    if (!t) throw new NotFoundError('Plantilla no encontrada');
    return t;
  }

  create(tenantId: string, userId: string | undefined, input: CreateEmailTemplateInput) {
    const data = createEmailTemplateSchema.parse(input);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailTemplate.create({
        data: {
          tenantId,
          name: data.name,
          subject: data.subject,
          bodyHtml: stripUnsafeHtml(data.bodyHtml),
          mjml: data.mjml,
          createdByUserId: userId,
        },
      }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateEmailTemplateInput) {
    const data = updateEmailTemplateSchema.parse(input);
    await this.get(tenantId, id);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailTemplate.update({
        where: { id },
        data: {
          name: data.name,
          subject: data.subject,
          bodyHtml: data.bodyHtml === undefined ? undefined : stripUnsafeHtml(data.bodyHtml),
          mjml: data.mjml === undefined ? undefined : data.mjml,
        },
      }),
    );
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.withTenant(tenantId, (tx) => tx.emailTemplate.delete({ where: { id } }));
  }

  /** Send a one-off preview of the template to `to`, with sample variable values. */
  async sendTest(tenantId: string, id: string, to: string) {
    const dest = (to ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest)) {
      throw new BadRequestException('Email de destino inválido');
    }
    const tpl = await this.get(tenantId, id);
    const bot = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bot.findFirst({ where: { channel: 'EMAIL' }, orderBy: { createdAt: 'asc' } }),
    );
    if (!bot) throw new BadRequestException('No hay ningún bot de email configurado');

    const sample: Record<string, string> = {
      '{nombre}': 'Nombre Apellido',
      '{first_name}': 'Nombre',
      '{email}': dest,
      '{telefono}': '+34 600 000 000',
    };
    const html = Object.entries(sample).reduce(
      (acc, [k, v]) => acc.split(k).join(v),
      tpl.bodyHtml,
    );

    await this.email.sendViaBot(tenantId, bot.id, {
      to: dest,
      subject: `[Prueba] ${tpl.subject || tpl.name}`,
      text: htmlToText(html),
      html,
    });
    return { ok: true };
  }
}
