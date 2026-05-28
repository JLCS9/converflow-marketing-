import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { ConversationsService } from './conversations.service.js';

@ApiTags('conversations')
@UseGuards(TenantAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.list(user.tenantId, {
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('count')
  count(@CurrentUser() user: AuthenticatedUser) {
    return this.conversations.counts(user.tenantId);
  }

  @Get(':id')
  thread(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.thread(user.tenantId, id);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.markRead(user.tenantId, id);
  }

  @Post(':id/close')
  close(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.setStatus(user.tenantId, id, 'close');
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.setStatus(user.tenantId, id, 'reopen');
  }
}
