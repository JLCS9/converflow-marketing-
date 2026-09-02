import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { VerticalsService } from './verticals.service.js';

@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('settings')
@Controller('verticals')
export class VerticalsController {
  constructor(private readonly verticals: VerticalsService) {}

  @Get()
  list() {
    return this.verticals.list();
  }

  @Post(':template/apply')
  apply(@Param('template') template: string, @CurrentUser() user: AuthenticatedUser) {
    return this.verticals.apply(user.tenantId, template);
  }
}
