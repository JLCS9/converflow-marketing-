import { Injectable, BadRequestException } from '@nestjs/common';
import mjml2html from 'mjml';
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

/** Compile MJML → responsive HTML (server-side, reliable) and strip scripts. */
function compileMjml(mjml: string): string {
  const t = mjml.trim();
  const doc = t.startsWith('<mjml')
    ? t
    : t.startsWith('<mj-body')
      ? `<mjml>${t}</mjml>`
      : `<mjml><mj-body>${t}</mj-body></mjml>`;
  const { html } = mjml2html(doc, { validationLevel: 'soft' });
  return stripUnsafeHtml(html);
}

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
    const bodyHtml = data.mjml?.trim()
      ? compileMjml(data.mjml)
      : stripUnsafeHtml(data.bodyHtml ?? '');
    if (!bodyHtml.trim()) throw new BadRequestException('El diseño está vacío');
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailTemplate.create({
        data: {
          tenantId,
          name: data.name,
          subject: data.subject,
          bodyHtml,
          mjml: data.mjml,
          createdByUserId: userId,
        },
      }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateEmailTemplateInput) {
    const data = updateEmailTemplateSchema.parse(input);
    await this.get(tenantId, id);
    // Recompile bodyHtml from MJML when the builder sends it; else keep legacy.
    let bodyHtml: string | undefined;
    if (data.mjml?.trim()) bodyHtml = compileMjml(data.mjml);
    else if (data.bodyHtml !== undefined) bodyHtml = stripUnsafeHtml(data.bodyHtml);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.emailTemplate.update({
        where: { id },
        data: {
          name: data.name,
          subject: data.subject,
          bodyHtml,
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
