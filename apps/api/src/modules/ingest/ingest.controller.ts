import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { TenantOrApiKeyGuard } from '../../common/guards/tenant-or-api-key.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { IngestService } from './ingest.service.js';

/**
 * Entrada del plano de datos. Autenticación: sesión de tenant O API key con
 * el scope `events` (las integraciones del cliente usan API key). 202: el
 * contrato es asíncrono aunque F0 escriba en línea — los clientes no deben
 * asumir lectura-tras-escritura.
 */
@UseGuards(TenantOrApiKeyGuard, PermissionsGuard)
@RequirePerm('events')
@Controller('events')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post()
  @HttpCode(202)
  ingestBatch(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.ingest.ingestBatch(user.tenantId, body as never);
  }
}
