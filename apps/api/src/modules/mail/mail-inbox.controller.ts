import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { MailInboxService } from './mail-inbox.service.js';
import { MailComposeService } from './mail-compose.service.js';

@ApiTags('mail/inbox')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('conversations')
@Controller('mail')
export class MailInboxController {
  constructor(
    private readonly inbox: MailInboxService,
    private readonly compose: MailComposeService,
  ) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role };
  }

  @Get('connections/:id/threads')
  threads(
    @Param('id') id: string,
    @Query('folder') folder: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inbox.listThreads(user.tenantId, id, this.actor(user), folder);
  }

  @Get('connections/:id/folder-counts')
  folderCounts(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inbox.folderCounts(user.tenantId, id, this.actor(user));
  }

  @Get('threads/:id')
  thread(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inbox.getThread(user.tenantId, id, this.actor(user));
  }

  @Post('threads/:id/read')
  read(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inbox.setRead(user.tenantId, id, this.actor(user), true);
  }

  @Post('threads/:id/unread')
  unread(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inbox.setRead(user.tenantId, id, this.actor(user), false);
  }

  @Post('threads/:id/move')
  move(
    @Param('id') id: string,
    @Body() body: { folder?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inbox.move(user.tenantId, id, this.actor(user), body?.folder ?? '');
  }

  @Post('threads/:id/reply')
  reply(
    @Param('id') id: string,
    @Body() body: { html?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compose.reply(user.tenantId, id, this.actor(user), body?.html ?? '');
  }

  @Post('connections/:id/compose')
  composeNew(
    @Param('id') id: string,
    @Body() body: { to?: string; subject?: string; html?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compose.compose(user.tenantId, id, this.actor(user), body ?? {});
  }
}
