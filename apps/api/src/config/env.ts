import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_PUBLIC_URL: z.string().url().default('http://localhost:3000/admin'),

  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().min(1),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars'),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars'),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_DEFAULT_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_FAST_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  // Solo necesario si la API key es de tipo «identity-linked» (consola nueva).
  ANTHROPIC_WORKSPACE_ID: z.string().optional(),

  // Motor de IA (F0) — proveedor de embeddings intercambiable. 'stub' es
  // determinista y sin red (tests/desarrollo); la elección real se cierra con
  // el benchmark de F0. Cambiar de modelo = re-vectorizar colección.
  EMBEDDINGS_PROVIDER: z.enum(['stub', 'voyage', 'openai']).default('stub'),
  EMBEDDINGS_API_KEY: z.string().optional(),
  EMBEDDINGS_MODEL: z.string().optional(),
  EMBEDDINGS_DIM: z.coerce.number().int().positive().optional(),

  // Observabilidad IA (Langfuse Cloud UE). Opcional: sin claves no traza.
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('noreply@converflow.ai'),

  // Google Calendar OAuth (Sprint 5 — IA Reuniones). Optional: the feature is
  // gated on these being present. Redirect URI must match what's registered in
  // the Google Cloud OAuth client; defaults to `${API_PUBLIC_URL}/integrations/google/callback`.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),

  BOT_RUNNER_PORT: z.coerce.number().int().positive().default(4100),
  BOT_RUNNER_INTERNAL_TOKEN: z.string().min(16).optional(),
  // Internal URL of the bot-runner service (Docker network). Used by the API to
  // start/stop bots and poll QR/status.
  BOT_RUNNER_URL: z.string().url().default('http://bot-runner:4100'),

  // Generic S3-compatible storage (Cloudflare R2, Backblaze B2, AWS S3, MinIO, Wasabi…).
  // S3_REGION='auto' for R2; for AWS use the actual region ('eu-west-1', etc.).
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Environment validation failed');
  }
  return parsed.data;
}

export const env: Env = loadEnv();
