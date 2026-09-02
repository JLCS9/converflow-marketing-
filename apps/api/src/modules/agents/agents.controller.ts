import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { AgentsService } from './agents.service.js';
import { z } from 'zod';
import { AGENT_TOOLS, supportConfigSchema } from '@converflow/shared';

const identitySchema = z.object({
  tone: z.string().trim().max(160).optional(),
  language: z.string().trim().max(20).optional(),
  aiDisclosure: z.string().trim().max(500).optional(),
  tools: z.array(z.enum(AGENT_TOOLS)).max(AGENT_TOOLS.length).optional(),
  support: supportConfigSchema.optional(),
});

@ApiTags('agents')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.agents.list(user.tenantId);
  }

  /** E3 · Identidad del asistente único del tenant. */
  @Get('identity')
  identity(@CurrentUser() user: AuthenticatedUser) {
    return this.agents.getIdentity(user.tenantId);
  }

  @Patch('identity')
  updateIdentity(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = identitySchema.parse(body);
    return this.agents.updateIdentity(user.tenantId, input);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.findById(user.tenantId, id);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.create(user.tenantId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.update(user.tenantId, id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.remove(user.tenantId, id);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.agents.test(user.tenantId, id, body);
  }
}
