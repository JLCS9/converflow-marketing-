import { z } from 'zod';

/**
 * Tenant-level access control for converflow.
 *
 * We use a simple role + per-module override model:
 *
 *  - Every user has a `role` (OWNER / ADMIN / BUILDER / AGENT_USER).
 *  - Each role has a default set of allowed modules (ROLE_DEFAULTS).
 *  - A user can optionally have a `permissions` array that overrides the
 *    role defaults (e.g. an AGENT_USER granted `documents` access, or an
 *    ADMIN with `users` revoked).
 *  - The OWNER is special: they always have full access. Permissions on
 *    an OWNER record are ignored at runtime, so a UI bug or stale row
 *    can never lock the owner out of their own tenant.
 *
 * The resulting "effective permissions" are what the backend enforces
 * via @RequirePerm() and the frontend uses to gate UI.
 */

export const USER_ROLES = ['OWNER', 'ADMIN', 'BUILDER', 'AGENT_USER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Toggleable access modules. Each one corresponds to a coherent slice of
 * functionality the owner may want to grant or revoke as a whole.
 */
export const PERMISSION_MODULES = [
  /** Leads, Clients, Opportunities, Tasks — the core CRM data. */
  'crm',
  /** Inbox of conversations: view, reply, assign. */
  'conversations',
  /** Upload, list and share documents. */
  'documents',
  /** Create, edit and publish AI agents. */
  'agents',
  /** Create and configure bots / channel connections. */
  'bots',
  /** Bulk lead scoring with AI. */
  'bulkAi',
  /** CSV lead import. */
  'import',
  /** Tenant configuration: custom fields, pipelines. */
  'settings',
  /** Invite, edit and remove other users of the tenant. */
  'users',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/** Defaults for every role. OWNER is omitted on purpose — it is always full. */
const ADMIN_DEFAULTS: ReadonlyArray<PermissionModule> = [
  'crm',
  'conversations',
  'documents',
  'agents',
  'bots',
  'bulkAi',
  'import',
  'settings',
  'users',
];

const BUILDER_DEFAULTS: ReadonlyArray<PermissionModule> = [
  'crm',
  'conversations',
  'documents',
  'agents',
  'bots',
  'bulkAi',
];

const AGENT_USER_DEFAULTS: ReadonlyArray<PermissionModule> = ['crm', 'conversations'];

/**
 * Role → default modules. The OWNER row is informational only; runtime
 * checks short-circuit on role === 'OWNER' and grant everything.
 */
export const ROLE_DEFAULTS: Record<UserRole, ReadonlyArray<PermissionModule>> = {
  OWNER: PERMISSION_MODULES,
  ADMIN: ADMIN_DEFAULTS,
  BUILDER: BUILDER_DEFAULTS,
  AGENT_USER: AGENT_USER_DEFAULTS,
};

/**
 * Resolve the effective permissions for a user.
 *
 * - OWNER → always all modules.
 * - permissions === null/undefined → role defaults.
 * - permissions present → that explicit set, ignoring anything not in
 *   PERMISSION_MODULES (defensive: future schema changes don't surface
 *   ghost modules to clients).
 */
export function effectivePermissions(
  role: UserRole,
  permissions: ReadonlyArray<string> | null | undefined,
): PermissionModule[] {
  if (role === 'OWNER') return [...PERMISSION_MODULES];
  if (permissions == null) return [...ROLE_DEFAULTS[role]];
  const known = new Set<PermissionModule>(PERMISSION_MODULES);
  const out = new Set<PermissionModule>();
  for (const p of permissions) {
    if (known.has(p as PermissionModule)) out.add(p as PermissionModule);
  }
  return [...out];
}

/** True iff the user's effective permission set includes the given module. */
export function userCan(
  role: UserRole,
  permissions: ReadonlyArray<string> | null | undefined,
  module: PermissionModule,
): boolean {
  if (role === 'OWNER') return true;
  if (permissions == null) return ROLE_DEFAULTS[role].includes(module);
  return permissions.includes(module);
}

/** Zod helpers. */
export const permissionModuleSchema = z.enum(PERMISSION_MODULES);
export const userRoleSchema = z.enum(USER_ROLES);

/**
 * Schema for the permissions field as accepted by the API:
 *   - `null` → use role defaults.
 *   - array of modules → explicit override (deduped, sorted by canonical order).
 */
export const permissionsArraySchema = z
  .array(permissionModuleSchema)
  .max(PERMISSION_MODULES.length)
  .transform((arr) => {
    const seen = new Set<PermissionModule>();
    for (const p of arr) seen.add(p);
    return PERMISSION_MODULES.filter((m) => seen.has(m));
  });
