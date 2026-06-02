import { Global, Module } from '@nestjs/common';
import { TenantAuthGuard } from './tenant-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';
import { TenantOrApiKeyGuard } from './tenant-or-api-key.guard.js';

/**
 * Global module that exposes the auth guards everywhere. Without this,
 * each feature module had to list TenantAuthGuard in its `providers`
 * array — and the new PermissionsGuard wasn't registered anywhere, so
 * NestJS could not instantiate it at request time and every authed
 * endpoint returned 500.
 *
 * Marking the module @Global means a single registration in AppModule
 * makes both guards resolvable from any controller's @UseGuards()
 * decorator, regardless of which module that controller lives in.
 */
@Global()
@Module({
  providers: [TenantAuthGuard, PermissionsGuard, TenantOrApiKeyGuard],
  exports: [TenantAuthGuard, PermissionsGuard, TenantOrApiKeyGuard],
})
export class GuardsModule {}
