import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { LeadScoringService } from './lead-scoring.service.js';

interface StartBody {
  leadIds?: string[];
  filter?: { status?: string; ownerId?: string; search?: string };
  agentId?: string | null;
  updateStatus?: boolean;
  createOpportunities?: boolean;
}

@ApiTags('leads')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('bulkAi')
@Controller('leads/score-batch')
export class LeadScoringController {
  constructor(private readonly svc: LeadScoringService) {}

  @Post()
  start(@CurrentUser() user: AuthenticatedUser, @Body() body: StartBody) {
    return this.svc.start(user.tenantId, body ?? {});
  }

  @Get('recent')
  recent(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.recent(user.tenantId);
  }

  @Get(':id')
  status(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.status(user.tenantId, id);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.svc.cancel(user.tenantId, id);
    return { ok: true };
  }
}
