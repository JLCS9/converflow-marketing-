/**
 * Re-export types from the Prisma client.
 * Consumers should import from `@converflow/db/types` (or directly `@converflow/db`).
 */
export type {
  Tenant,
  User,
  UserSession,
  TenantInvitation,
  AccessLog,
  Bot,
  BotSession,
  Agent,
  PlatformAdmin,
  PlatformAdminSession,
  AdminActionLog,
  AppVersion,
  Prisma,
} from '@prisma/client';

export {
  TenantStatus,
  UserRole,
  UserStatus,
  Channel,
  BotStatus,
  AgentStatus,
  AdminStatus,
  AlertType,
  AlertSeverity,
} from '@prisma/client';
