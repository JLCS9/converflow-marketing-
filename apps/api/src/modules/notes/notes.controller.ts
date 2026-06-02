import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantOrApiKeyGuard } from '../../common/guards/tenant-or-api-key.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { NotesService } from './notes.service.js';

@ApiTags('notes')
@UseGuards(TenantOrApiKeyGuard, PermissionsGuard)
@RequirePerm('crm')
@Controller(['notes', 'v1/notes'])
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

  @Get('analyzed')
  listAnalyzed(
    @CurrentUser() user: AuthenticatedUser,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notes.listAnalyzed(user.tenantId, {
      category,
      limit: limit ? Number(limit) : undefined,
    });
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
