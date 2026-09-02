import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { EnrichmentService } from './enrichment.service.js';

/** F3 · Acciones sobre perfiles del plano de datos. */
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('crm')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly enrichment: EnrichmentService) {}

  /** Enriquecimiento B2B fase 1 (web pública del dominio corporativo). */
  @Post(':id/enrich')
  enrich(
    @Param('id') id: string,
    @Body() body: { force?: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enrichment.enrichProfile(user.tenantId, id, { force: body?.force === true });
  }
}
