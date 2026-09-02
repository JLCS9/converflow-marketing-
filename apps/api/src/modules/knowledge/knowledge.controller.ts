import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { KnowledgeService } from './knowledge.service.js';

const textSourceSchema = z.object({
  title: z.string().trim().min(2).max(120),
  text: z.string().trim().min(20).max(200_000),
  meta: z.record(z.unknown()).optional(),
});

const verifiedSchema = z.object({
  question: z.string().trim().min(5).max(2000),
  answer: z.string().trim().min(2).max(8000),
  meta: z.record(z.unknown()).optional(),
  validUntil: z.coerce.date().optional(),
});

const instructionsSchema = z.object({
  items: z.array(z.object({ content: z.string().trim().min(3).max(2000) })).max(100),
});

const coverGapSchema = z.object({ answer: z.string().trim().min(2).max(8000) });

/**
 * Gestión de la memoria del tenant (F2). Permiso `agents`: es la misma
 * audiencia que hoy configura el conocimiento del asistente.
 */
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('agents')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('sources')
  listSources(@CurrentUser() user: AuthenticatedUser) {
    return this.knowledge.listSources(user.tenantId);
  }

  @Delete('sources')
  deleteSource(@Query('ref') ref: string, @CurrentUser() user: AuthenticatedUser) {
    const sourceRef = z.string().trim().min(6).max(120).parse(ref);
    return this.knowledge.deleteSource(user.tenantId, sourceRef);
  }

  @Post('sources/text')
  addText(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = textSourceSchema.parse(body);
    return this.knowledge.addTextSource(user.tenantId, input);
  }

  @Get('verified')
  listVerified(@CurrentUser() user: AuthenticatedUser) {
    return this.knowledge.listVerifiedAnswers(user.tenantId);
  }

  @Post('verified')
  addVerified(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = verifiedSchema.parse(body);
    return this.knowledge.addVerifiedAnswer(user.tenantId, {
      ...input,
      verifiedBy: user.email,
    });
  }

  @Delete('verified/:id')
  deactivateVerified(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledge.deactivateVerifiedAnswer(user.tenantId, id);
  }

  @Get('instructions')
  listInstructions(@CurrentUser() user: AuthenticatedUser) {
    return this.knowledge.listInstructions(user.tenantId);
  }

  @Post('instructions')
  setInstructions(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = instructionsSchema.parse(body);
    return this.knowledge.setInstructions(user.tenantId, input.items);
  }

  @Get('gaps')
  listGaps(@CurrentUser() user: AuthenticatedUser) {
    return this.knowledge.listGaps(user.tenantId);
  }

  @Post('gaps/:id/cover')
  coverGap(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = coverGapSchema.parse(body);
    return this.knowledge.coverGap(user.tenantId, id, input.answer, user.email);
  }

  @Post('gaps/:id/dismiss')
  dismissGap(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledge.dismissGap(user.tenantId, id);
  }

  /** Búsqueda de prueba para el panel (qué recuperaría el motor). */
  @Post('retrieve')
  retrieve(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = z.object({ query: z.string().trim().min(2).max(500) }).parse(body);
    return this.knowledge.retrieve(user.tenantId, input.query);
  }
}
