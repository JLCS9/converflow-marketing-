import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantOrApiKeyGuard } from '../../common/guards/tenant-or-api-key.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { OpportunitiesService } from './opportunities.service.js';

@ApiTags('opportunities')
@UseGuards(TenantOrApiKeyGuard, PermissionsGuard)
@RequirePerm('crm')
@Controller(['opportunities', 'v1/opportunities'])
export class OpportunitiesController {
  constructor(private readonly opps: OpportunitiesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('pipelineId') pipelineId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.opps.list(user.tenantId, {
      status,
      ownerId,
      pipelineId,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('pipeline')
  pipeline(@CurrentUser() user: AuthenticatedUser) {
    return this.opps.pipeline(user.tenantId);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.opps.findById(user.tenantId, id);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.opps.create(user.tenantId, body as never, user.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opps.update(user.tenantId, id, body as never, user.userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.opps.remove(user.tenantId, id);
    return { ok: true };
  }
}
