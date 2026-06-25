import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { MailConnectionsService } from './mail-connections.service.js';

@ApiTags('mail/connections')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('mail')
@Controller('mail/connections')
export class MailConnectionsController {
  constructor(private readonly connections: MailConnectionsService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role };
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.connections.list(user.tenantId, this.actor(user));
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.connections.get(user.tenantId, id, this.actor(user));
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.connections.create(user.tenantId, this.actor(user), body as never);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.connections.update(user.tenantId, id, this.actor(user), body as never);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.connections.remove(user.tenantId, id, this.actor(user));
    return { ok: true };
  }

  @Post(':id/test-send')
  testSend(
    @Param('id') id: string,
    @Body() body: { to?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.connections.testSend(user.tenantId, id, this.actor(user), (body?.to ?? '').trim());
  }

  @Post(':id/test-sync')
  testSync(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.connections.testSync(user.tenantId, id, this.actor(user));
  }
}
