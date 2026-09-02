import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { RoutingService } from './routing.service.js';

const ruleSchema = z.object({
  id: z.string().optional(),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'WEBCHAT']),
  endpointId: z.string().nullable().optional(),
  name: z.string().trim().min(2).max(80),
  order: z.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  fromDomain: z.string().trim().max(120).nullable().optional(),
  assignUserId: z.string().min(1),
});

/** Atención autónoma · Reglas de enrutado (todos los canales). El CRUD lo
 *  gestiona quien administra los canales ('mail' hoy — misma audiencia). */
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('mail')
@Controller('routing-rules')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Get()
  list(@Query('channel') channel: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.routing.list(user.tenantId, channel);
  }

  @Post()
  upsert(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = ruleSchema.parse(body);
    return this.routing.upsert(user.tenantId, input);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.routing.remove(user.tenantId, id);
  }
}
