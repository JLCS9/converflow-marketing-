export const KIT_DIGITAL_SEGMENTS = ['IV', 'V'] as const;
export type KitDigitalSegment = (typeof KIT_DIGITAL_SEGMENTS)[number];

export const SEGMENT_USER_QUOTA: Record<KitDigitalSegment, number> = {
  IV: 20,
  V: 25,
};

export const DEFAULT_TENANT_LIMITS = {
  maxUsers: 20,
  maxBots: 1,
  maxConversationsPerMonth: 5000,
  maxStorageGb: 5,
} as const;

export const SESSION_TTL_MINUTES = {
  tenant: 60 * 12, // 12h
  admin: 30, // 30m
  admin_refresh_hours: 8,
} as const;

export const RATE_LIMITS = {
  bot_warmup_messages_per_day: 200,
  bot_default_per_minute: 60,
  bot_default_per_hour: 1500,
  api_per_minute_per_tenant: 600,
  login_attempts_per_hour_per_email: 10,
} as const;

export const PASSWORD_RULES = {
  minLength: 12,
  requireUpper: true,
  requireLower: true,
  requireNumber: true,
  requireSymbol: false,
} as const;
