import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { CampaignsService } from './campaigns.service.js';

@ApiTags('campaigns')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.list(user.tenantId);
  }

  @Post('preview')
  preview(
    @Body() body: { channel?: string; audience?: unknown },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaigns.previewAudience(user.tenantId, body.channel ?? 'EMAIL', body.audience);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.get(user.tenantId, id);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.create(user.tenantId, user.userId, body as never);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.update(user.tenantId, id, body as never);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.campaigns.remove(user.tenantId, id);
    return { ok: true };
  }

  @Post(':id/launch')
  launch(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.launch(user.tenantId, id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.cancel(user.tenantId, id);
  }
}
