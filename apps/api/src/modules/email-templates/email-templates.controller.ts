import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { EmailTemplatesService } from './email-templates.service.js';

@ApiTags('email-templates')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('conversations')
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.templates.list(user.tenantId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.templates.get(user.tenantId, id);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.templates.create(user.tenantId, user.userId, body as never);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.templates.update(user.tenantId, id, body as never);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.templates.remove(user.tenantId, id);
    return { ok: true };
  }
}
