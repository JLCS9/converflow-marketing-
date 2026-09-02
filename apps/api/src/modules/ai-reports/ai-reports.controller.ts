import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { AiReportsService } from './ai-reports.service.js';

/** F4 · Informe mensual del asistente (misma audiencia que agentes). */
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('agents')
@Controller('ai/reports')
export class AiReportsController {
  constructor(private readonly reports: AiReportsService) {}

  @Get('monthly')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.list(user.tenantId);
  }

  /** Generación manual (el cron mensual hace esto mismo el día 1). */
  @Post('monthly/generate')
  generate(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(body);
    return this.reports.generate(user.tenantId, input.month);
  }
}
