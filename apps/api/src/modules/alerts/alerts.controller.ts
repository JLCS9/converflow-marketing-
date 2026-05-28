import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { AlertsService } from './alerts.service.js';

@ApiTags('alerts')
@UseGuards(TenantAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeDismissed') includeDismissed?: string,
  ) {
    return this.alerts.list(user.tenantId, {
      includeDismissed: includeDismissed === 'true' || includeDismissed === '1',
    });
  }

  @Get('count')
  count(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.unreadCount(user.tenantId);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alerts.markRead(user.tenantId, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.markAllRead(user.tenantId);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alerts.dismiss(user.tenantId, id);
  }
}
