import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { ApiKeysService } from './api-keys.service.js';

/**
 * Management surface for tenant-scoped API keys. Only reachable through
 * the cookie session — never via the keys themselves — so a leaked key
 * cannot create more keys (`users` perm).
 */
@ApiTags('api-keys')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('users')
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly svc: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.tenantId);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.create(body as never, {
      tenantId: user.tenantId,
      currentUserId: user.userId,
      currentUserEmail: user.email,
    });
  }

  @Delete(':id')
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.svc.revoke(id, {
      tenantId: user.tenantId,
      currentUserId: user.userId,
      currentUserEmail: user.email,
    });
    return { ok: true };
  }
}
