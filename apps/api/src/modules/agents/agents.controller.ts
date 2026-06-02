import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { AgentsService } from './agents.service.js';

@ApiTags('agents')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.agents.list(user.tenantId);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.findById(user.tenantId, id);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.create(user.tenantId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.update(user.tenantId, id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.remove(user.tenantId, id);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.test(user.tenantId, id, body);
  }
}
