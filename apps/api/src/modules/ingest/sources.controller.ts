import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { NotFoundError } from '@converflow/shared';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { env } from '../../config/env.js';

const createSourceSchema = z.object({
  kind: z.enum(['brevo', 'learndash', 'woocommerce', 'generic']),
  name: z.string().trim().min(1).max(80),
  /** Clave HMAC si la fuente firma (WooCommerce la genera al crear el webhook). */
  secret: z.string().trim().min(8).max(200).optional(),
});

/**
 * Gestión de fuentes de webhook del tenant (F1). Devuelve la URL pública a
 * pegar en el sistema origen (Brevo/WP/Woo). Desactivar corta el grifo al
 * instante sin perder historial.
 */
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('settings')
@Controller('ingest/sources')
export class SourcesController {
  constructor(private readonly prisma: PrismaService) {}

  private withUrl<T extends { id: string }>(row: T) {
    return { ...row, webhookUrl: `${env.API_PUBLIC_URL}/webhooks/${row.id}` };
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.ingestSource.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, kind: true, name: true, active: true,
          received: true, lastEventAt: true, createdAt: true,
        },
      }),
    );
    return rows.map((r) => this.withUrl(r));
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = createSourceSchema.parse(body);
    const row = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.ingestSource.create({
        data: { tenantId: user.tenantId, kind: input.kind, name: input.name, secret: input.secret },
        select: { id: true, kind: true, name: true, active: true, createdAt: true },
      }),
    );
    return this.withUrl(row);
  }

  @Delete(':id')
  async deactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const res = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.ingestSource.updateMany({ where: { id }, data: { active: false } }),
    );
    if (res.count === 0) throw new NotFoundError('Fuente no encontrada');
    return { ok: true };
  }
}
