import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { BadRequestError } from '@converflow/shared';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { MailInboxService } from './mail-inbox.service.js';
import { MailComposeService } from './mail-compose.service.js';
import { MailSharedService } from './mail-shared.service.js';
import { MailAttachmentsService, type StagedAttachment } from './mail-attachments.service.js';

type MultipartFile = {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
};

@ApiTags('mail/inbox')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('conversations')
@Controller('mail')
export class MailInboxController {
  constructor(
    private readonly inbox: MailInboxService,
    private readonly compose: MailComposeService,
    private readonly shared: MailSharedService,
    private readonly attachments: MailAttachmentsService,
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

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.unreadCount(user.tenantId, this.actor(user));
  }

  @Get('pending')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.pending(user.tenantId, this.actor(user));
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
    body: {
      html?: string;
      to?: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      attachments?: StagedAttachment[];
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compose.reply(user.tenantId, id, this.actor(user), body ?? {});
  }

  @Post('messages/:id/forward')
  forward(
    @Param('id') id: string,
    @Body()
    body: {
      to?: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      html?: string;
      attachments?: StagedAttachment[];
    },
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
      attachments?: StagedAttachment[];
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compose.compose(user.tenantId, id, this.actor(user), body ?? {});
  }

  // ---- attachments ----
  @Post('attachments/upload')
  async uploadAttachment(@Req() req: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const file: MultipartFile | undefined = await (
      req as FastifyRequest & { file: () => Promise<MultipartFile | undefined> }
    ).file();
    if (!file) throw new BadRequestError('No se ha enviado fichero');
    const buffer = await file.toBuffer();
    return this.attachments.uploadStaging(user.tenantId, {
      buffer,
      filename: file.filename,
      mimeType: file.mimetype,
      sizeBytes: buffer.byteLength,
    });
  }

  @Get('attachments/:id/download')
  downloadAttachment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attachments.downloadUrl(user.tenantId, id, this.actor(user));
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
      attachments?: StagedAttachment[];
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

  // ---- shared mailbox: assignment / status / notes / lock ----
  @Get('team')
  team(@CurrentUser() user: AuthenticatedUser) {
    return this.shared.listTeam(user.tenantId);
  }

  @Post('threads/:id/assign')
  assign(
    @Param('id') id: string,
    @Body() body: { assigneeUserId?: string | null },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shared.assign(user.tenantId, id, this.actor(user), body?.assigneeUserId ?? null);
  }

  @Post('threads/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() body: { status?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shared.setStatus(user.tenantId, id, this.actor(user), body?.status ?? '');
  }

  @Post('threads/:id/save-lead')
  saveLead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inbox.saveLead(user.tenantId, id, this.actor(user));
  }

  @Get('threads/:id/notes')
  notes(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shared.listNotes(user.tenantId, id, this.actor(user));
  }

  @Post('threads/:id/notes')
  addNote(
    @Param('id') id: string,
    @Body() body: { body?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shared.addNote(user.tenantId, id, this.actor(user), body?.body ?? '');
  }

  @Delete('notes/:id')
  deleteNote(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shared.deleteNote(user.tenantId, id, this.actor(user));
  }

  @Post('threads/:id/claim')
  claim(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shared.claim(user.tenantId, id, this.actor(user));
  }

  @Post('threads/:id/release')
  release(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shared.release(user.tenantId, id, this.actor(user));
  }
}
