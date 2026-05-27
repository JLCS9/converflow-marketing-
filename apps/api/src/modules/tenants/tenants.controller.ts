import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Tenant } from '@converflow/db';
import { TenantsService, type TenantListItem } from './tenants.service.js';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard.js';
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from '../../common/decorators/current-user.decorator.js';

@ApiTags('admin/tenants')
@UseGuards(AdminAuthGuard)
@Controller('admin/tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(@Query('limit') limit?: string, @Query('offset') offset?: string): Promise<TenantListItem[]> {
    return this.tenants.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post()
  create(
    @Body() body: unknown,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<{ tenant: Tenant; ownerTempPassword: string }> {
    return this.tenants.create(body as never, admin.adminId);
  }

  @Patch(':id/limits')
  updateLimits(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<Tenant> {
    return this.tenants.updateLimits(id, body as never, admin.adminId);
  }
}
