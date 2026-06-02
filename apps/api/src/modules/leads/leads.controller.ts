import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { LeadsService } from './leads.service.js';

@ApiTags('leads')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('crm')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.leads.list(user.tenantId, {
      status,
      ownerId,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('count')
  count(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('search') search?: string,
  ) {
    return this.leads.count(user.tenantId, { status, ownerId, search });
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leads.findById(user.tenantId, id);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.leads.create(user.tenantId, body as never);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leads.update(user.tenantId, id, body as never);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.leads.remove(user.tenantId, id);
    return { ok: true };
  }

  @Post('import')
  @RequirePerm('import')
  bulkImport(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.leads.bulkImport(user.tenantId, body as never);
  }

  @Post(':id/score')
  score(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leads.score(user.tenantId, id);
  }
}
