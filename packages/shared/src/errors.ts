/**
 * Tagged error types for converflow-app.
 *
 * Conventions:
 *   - Errors are plain classes extending `AppError`.
 *   - Each carries a stable `code` (used in API responses and logs).
 *   - HTTP status comes from the error so handlers stay generic.
 */

export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TENANT_LIMIT_REACHED'
  | 'INVALID_2FA'
  | 'EXPIRED'
  | 'BOT_LIMIT_REACHED'
  | 'BOT_NOT_CONNECTED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    httpStatus = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: Record<string, unknown>) {
    super('BAD_REQUEST', message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfterSeconds?: number) {
    super('RATE_LIMITED', message, 429, { retryAfterSeconds });
  }
}

export class TenantLimitReachedError extends AppError {
  constructor(
    limit: 'users' | 'bots' | 'conversations' | 'storage',
    current: number,
    max: number,
  ) {
    super(
      'TENANT_LIMIT_REACHED',
      `Tenant ${limit} limit reached (${current}/${max})`,
      403,
      { limit, current, max },
    );
  }
}

export class Invalid2FAError extends AppError {
  constructor() {
    super('INVALID_2FA', 'Invalid 2FA code', 401);
  }
}
