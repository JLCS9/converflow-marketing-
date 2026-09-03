import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  /**
   * Da de alta una tienda NUEVA (varias tiendas por tenant están soportadas
   * a propósito — p. ej. una instalación de WordPress por idioma del mismo
   * negocio). `label` es opcional, solo para distinguirlas en la UI.
   */
  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePerm('settings')
  @Post('connect')
  connect(@Body() body: { label?: string } | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.woocommerce.connect(user.tenantId, body?.label);
  }

  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePerm('settings')
  @Get('connections')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.woocommerce.list(user.tenantId);
  }

  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePerm('settings')
  @Delete(':id')
  disconnect(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.woocommerce.disconnect(user.tenantId, id);
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
