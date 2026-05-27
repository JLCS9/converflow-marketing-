import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { NotesService } from './notes.service.js';

@ApiTags('notes')
@UseGuards(TenantAuthGuard)
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('leadId') leadId?: string,
    @Query('clientId') clientId?: string,
    @Query('opportunityId') opportunityId?: string,
  ) {
    return this.notes.list(user.tenantId, { leadId, clientId, opportunityId });
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.create(user.tenantId, user.userId, body as never);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notes.update(user.tenantId, id, body as never);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.notes.remove(user.tenantId, id);
    return { ok: true };
  }

  @Post(':id/analyze')
  analyze(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.analyze(user.tenantId, id);
  }
}
