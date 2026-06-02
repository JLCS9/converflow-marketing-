import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CustomFieldEntity } from '@converflow/shared';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { CustomFieldsService } from './custom-fields.service.js';

@ApiTags('custom-fields')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequirePerm('settings')
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly svc: CustomFieldsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entityType') entityType?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.svc.list(
      user.tenantId,
      entityType ? (entityType as CustomFieldEntity) : undefined,
      includeArchived === 'true',
    );
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.create(user.tenantId, body as never);
  }

  @Patch('reorder')
  reorder(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.reorder(user.tenantId, body as never);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(user.tenantId, id, body as never);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.svc.remove(user.tenantId, id);
    return { ok: true };
  }
}
