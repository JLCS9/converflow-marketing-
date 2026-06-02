import { z } from 'zod';
import { permissionModuleSchema, type PermissionModule } from './permissions';

/**
 * Wire format for the public API token. The full secret has the shape
 *
 *   cfai_<32-char base62 random>
 *
 * - `cfai_` is the brand prefix so users can tell at a glance what kind of
 *   secret this is and so log scrubbing tools can spot leaks.
 * - The visible "prefix" exposed in the dashboard is the first 10 chars of
 *   the secret (always starts with `cfai_`). The remaining 27 chars are
 *   shown ONCE at creation and never stored — only the SHA-256 hash of the
 *   full string lives in the DB.
 */
export const API_KEY_PREFIX = 'cfai_';
export const API_KEY_BODY_LENGTH = 32;
export const API_KEY_TOTAL_LENGTH = API_KEY_PREFIX.length + API_KEY_BODY_LENGTH;
/** "cfai_" + first 5 chars of the body = 10 chars visible to humans. */
export const API_KEY_VISIBLE_PREFIX_LENGTH = API_KEY_PREFIX.length + 5;

/** Inputs accepted when creating a key. */
export const createApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(80, 'Máximo 80 caracteres'),
  scopes: z
    .array(permissionModuleSchema)
    .min(1, 'Selecciona al menos un permiso')
    .max(20),
  /**
   * ISO date string. The key stops working at this instant. When omitted
   * the key never expires (typical for server-to-server integrations).
   */
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

/** Public-safe shape returned by list/get endpoints (no secret material). */
export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: PermissionModule[];
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

/** Special shape returned the ONE time a key is created. */
export interface ApiKeyCreated extends ApiKeySummary {
  /** Full secret — show once, copy, then never again. */
  secret: string;
}
