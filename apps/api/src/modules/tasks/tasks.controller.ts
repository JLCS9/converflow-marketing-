import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { TasksService } from './tasks.service.js';

@ApiTags('tasks')
@UseGuards(TenantAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('leadId') leadId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('clientId') clientId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.tasks.list(user.tenantId, {
      status,
      ownerId,
      leadId,
      opportunityId,
      clientId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.stats(user.tenantId);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.create(user.tenantId, body as never);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.update(user.tenantId, id, body as never);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.tasks.remove(user.tenantId, id);
    return { ok: true };
  }
}
