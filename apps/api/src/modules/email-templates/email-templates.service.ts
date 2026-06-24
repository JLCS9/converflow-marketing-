import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  type CreateEmailTemplateInput,
  type UpdateEmailTemplateInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { sanitizeEmailHtml } from '../../common/utils/email-html.js';

@Injectable()
export class EmailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

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
          bodyHtml: sanitizeEmailHtml(data.bodyHtml),
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
          bodyHtml: data.bodyHtml === undefined ? undefined : sanitizeEmailHtml(data.bodyHtml),
        },
      }),
    );
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.withTenant(tenantId, (tx) => tx.emailTemplate.delete({ where: { id } }));
  }
}
