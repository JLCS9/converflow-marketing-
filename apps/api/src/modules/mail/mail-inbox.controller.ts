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
import { MailAiService } from './mail-ai.service.js';
import { MailDraftAiService } from './mail-draft-ai.service.js';

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
    private readonly mailAi: MailAiService,
    private readonly draftAi: MailDraftAiService,
  ) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role };
  }

  @Get('connections/:id/threads')
  threads(
    @Param('id') id: string,
    @Query('folder') folder: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('mine') mine: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inbox.listThreads(user.tenantId, id, this.actor(user), folder, {
      cursor,
      limit: limit ? Number(limit) : undefined,
      mine: mine === '1' || mine === 'true',
    });
  }

  /** Contadores del filtro «Solo los míos» (asignados a mí / sin leer para mí). */
  @Get('connections/:id/mine-counts')
  mineCounts(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inbox.mineCounts(user.tenantId, id, this.actor(user));
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.unreadCount(user.tenantId, this.actor(user));
  }

  @Get('pending')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.pending(user.tenantId, this.actor(user));
  }

  @Get('unread-by-connection')
  unreadByConnection(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.unreadByConnection(user.tenantId, this.actor(user));
  }

  @Get('connections/:id/folder-counts')
  folderCounts(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inbox.folderCounts(user.tenantId, id, this.actor(user));
  }

  @Get('connections/:id/search')
  search(
    @Param('id') id: string,
    @Query('q') q: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inbox.search(user.tenantId, id, this.actor(user), q ?? '', {
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('threads/:id')
  thread(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inbox.getThread(user.tenantId, id, this.actor(user));
  }

  /**
   * Thread summary. POST, not GET: it may spend money and it writes the cache.
   * Returns the cached summary untouched unless the thread grew or force=true.
   */
  @Post('threads/:id/ai/summary')
  summary(
    @Param('id') id: string,
    @Body() body: { force?: boolean; locale?: string } | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mailAi.summarize(user.tenantId, id, this.actor(user), {
      force: body?.force === true,
      locale: body?.locale,
    });
  }

  /**
   * Writing assistant. Never sends: the result goes to the composer for review.
   */
  @Post('threads/:id/ai/draft')
  draftReply(
    @Param('id') id: string,
    @Body() body: { instruction?: string; tone?: string; length?: string } | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.draftAi.draftReply(user.tenantId, id, this.actor(user), body ?? {});
  }

  @Post('connections/:id/ai/draft')
  draftNew(
    @Param('id') id: string,
    @Body() body: { instruction?: string; to?: string; tone?: string; length?: string } | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.draftAi.draftNew(user.tenantId, id, this.actor(user), body ?? {});
  }

  /** Rework text the user already typed (mejorar / acortar / formal / cercano / traducir). */
  @Post('ai/refine')
  refine(
    @Body() body: { html?: string; action?: string; lang?: string } | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.draftAi.refine(user.tenantId, this.actor(user), body ?? {});
  }

  @Post('messages/:id/ai/translate')
  translate(
    @Param('id') id: string,
    @Body() body: { lang?: string } | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mailAi.translate(user.tenantId, id, this.actor(user), body?.lang ?? 'es');
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
      subject?: string;
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
