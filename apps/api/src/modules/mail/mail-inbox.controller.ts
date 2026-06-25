import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  @Get('connections/:id/search')
  search(
    @Param('id') id: string,
    @Query('q') q: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inbox.search(user.tenantId, id, this.actor(user), q ?? '');
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
    @Body()
    body: { html?: string; to?: string | string[]; cc?: string | string[]; bcc?: string | string[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compose.reply(user.tenantId, id, this.actor(user), body ?? {});
  }

  @Post('messages/:id/forward')
  forward(
    @Param('id') id: string,
    @Body()
    body: { to?: string | string[]; cc?: string | string[]; bcc?: string | string[]; html?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compose.forward(user.tenantId, id, this.actor(user), body ?? {});
  }

  @Post('connections/:id/compose')
  composeNew(
    @Param('id') id: string,
    @Body()
    body: {
      to?: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      subject?: string;
      html?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compose.compose(user.tenantId, id, this.actor(user), body ?? {});
  }

  // ---- drafts ----
  @Post('drafts')
  saveDraft(
    @Body()
    body: {
      draftId?: string;
      threadId?: string;
      connectionId?: string;
      to?: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      subject?: string;
      html?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compose.saveDraft(user.tenantId, this.actor(user), body ?? {});
  }

  @Post('drafts/:id/send')
  sendDraft(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.compose.sendDraft(user.tenantId, id, this.actor(user));
  }

  @Delete('drafts/:id')
  deleteDraft(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.compose.deleteDraft(user.tenantId, id, this.actor(user));
  }
}
