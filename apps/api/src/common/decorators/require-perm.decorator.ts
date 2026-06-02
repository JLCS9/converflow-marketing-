import { SetMetadata } from '@nestjs/common';
import type { PermissionModule } from '@converflow/shared';

/**
 * Metadata key used by PermissionsGuard to read the required modules.
 */
export const REQUIRE_PERM_KEY = 'cf:require-perm';

/**
 * Declare which permission module(s) the handler requires. When multiple
 * modules are listed the user must have ALL of them. Use one decorator per
 * controller method (or once at the controller class for all methods).
 *
 * The guard short-circuits for OWNERs — they always pass.
 *
 *   @RequirePerm('crm') @Get() list() { ... }
 *   @RequirePerm('import') @Post('bulk') bulk() { ... }
 */
export function RequirePerm(...modules: PermissionModule[]) {
  return SetMetadata(REQUIRE_PERM_KEY, modules);
}
