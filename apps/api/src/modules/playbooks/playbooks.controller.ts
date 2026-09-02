import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { PlaybooksService } from './playbooks.service.js';

const triggerSchema = z.union([
  z.object({ on: z.literal('transition'), toState: z.string().trim().min(1).max(60) }),
  z.object({ on: z.literal('event'), eventType: z.string().trim().min(1).max(60) }),
]);

const playbookSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  active: z.boolean().optional(),
  trigger: triggerSchema,
  action: z.object({
    kind: z.literal('followup'),
    instructions: z.string().trim().min(10).max(2000),
  }),
  mode: z.enum(['DRAFT_APPROVE', 'AUTO']).optional(),
  guardrails: z
    .object({
      maxPerContactDays: z.number().int().min(1).max(365).optional(),
      requireConsent: z.boolean().optional(),
      quietStartHour: z.number().int().min(0).max(23).optional(),
      quietEndHour: z.number().int().min(0).max(23).optional(),
    })
    .optional(),
});

/** F3 · Playbooks (misma audiencia que configura los agentes). */
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('agents')
@Controller('playbooks')
export class PlaybooksController {
  constructor(private readonly playbooks: PlaybooksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.playbooks.list(user.tenantId);
  }

  @Post()
  upsert(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = playbookSchema.parse(body);
    return this.playbooks.upsert(user.tenantId, input as never);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.playbooks.remove(user.tenantId, id);
  }

  @Get('runs')
  listRuns(@Query('status') status: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.playbooks.listRuns(user.tenantId, status);
  }

  @Post('runs/:id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = z.object({ editedText: z.string().trim().min(2).max(4000).optional() }).parse(body ?? {});
    return this.playbooks.approve(user.tenantId, id, {
      editedText: input.editedText,
      reviewer: { userId: user.userId, email: user.email },
    });
  }

  @Post('runs/:id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.playbooks.reject(user.tenantId, id, user.email);
  }
}
