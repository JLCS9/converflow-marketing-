import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@UseGuards(TenantAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.overview(user.tenantId);
  }

  @Get('series')
  series(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.series(user.tenantId);
  }
}
