import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ecommerceRegisterSchema } from '@converflow/shared';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { WoocommerceService } from './woocommerce.service.js';

@ApiTags('integrations/woocommerce')
@Controller('integrations/woocommerce')
export class WoocommerceController {
  constructor(private readonly woocommerce: WoocommerceService) {}

  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePerm('settings')
  @Get('connect')
  connect(@CurrentUser() user: AuthenticatedUser) {
    return this.woocommerce.connect(user.tenantId);
  }

  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePerm('settings')
  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.woocommerce.status(user.tenantId);
  }

  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePerm('settings')
  @Delete()
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.woocommerce.disconnect(user.tenantId);
  }

  /**
   * Público: lo llama el plugin de WordPress, que no tiene sesión de
   * Converflow. La autorización es la propia clave de conexión de un solo
   * uso — igual que la fila de IngestSource autoriza /webhooks/:sourceId.
   */
  @Post('register')
  register(@Body() body: unknown) {
    const input = ecommerceRegisterSchema.parse(body);
    return this.woocommerce.register(input);
  }
}
