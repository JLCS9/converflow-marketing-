import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { ReportsService } from './reports.service.js';

/** ISO/yyyy-mm-dd → Date, o undefined si no parsea — un rango roto en la URL
 *  no debe reventar el endpoint, solo caer al default (últimos 30 días). */
function parseDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@ApiTags('reports')
@UseGuards(TenantAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.overview(user.tenantId);
  }

  @Get('attention')
  attention(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.attention(user.tenantId);
  }

  @Get('series')
  series(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.series(user.tenantId);
  }

  /** Bloque de Inteligencia de Negocio — ver ReportsService.economics(). */
  @Get('economics')
  economics(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('source') source?: string,
  ) {
    return this.reports.economics(user.tenantId, { from: parseDate(from), to: parseDate(to), source });
  }
}
