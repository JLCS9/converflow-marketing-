# Architecture

## High-level diagram

```
Internet ──► Traefik (TLS, redirects)
              │
              ├── app.converflow.ai      → web   (Next.js 15)
              ├── admin.converflow.ai    → web   (super admin routes)
              ├── api.converflow.ai      → api   (NestJS + Fastify)
              └── hooks.converflow.ai    → api   /webhooks/*

api  ──► Postgres 16 (pool model, RLS, pgvector)
     ├─► Redis 7    (sessions, BullMQ, cache, rate-limit)
     └─► workers / bot-runner (via Redis)

workers   ──► Anthropic Claude (prompt caching)
          ├─► OCR engine
          ├─► Postgres
          └─► Channel APIs (Instagram, Messenger Graph)

bot-runner ──► WhatsApp / Baileys (long-lived sessions per Bot)
           ├─► Postgres (encrypted auth state)
           └─► Redis pub/sub (events → workers)
```

## Multitenancy

Pool model. Every tenant-scoped table has a `tenant_id` column. Postgres
**Row Level Security** (with FORCE) enforces isolation. The API sets
`app.tenant_id` per request via `withTenant(...)`. Platform-level
operations use `withRlsBypass(...)` and write to `admin_action_log`.

See [RLS.md](./RLS.md) for the full policy specification.

## Auth

Two completely separate auth flows:

| Flow | Cookie | Storage | 2FA |
|---|---|---|---|
| Tenant users | `cf_tenant_session` | `user_sessions` | optional (future) |
| Super admin  | `cf_admin_session`  | `platform_admin_sessions` | TOTP **required** |

Tokens are random 32 bytes; only SHA-256 hashes are stored. A DB dump
cannot be replayed as live sessions.

## Bots / WhatsApp

Per-tenant WhatsApp bots run on the `bot-runner` service, one Baileys
session per row in `bots`. Auth state is encrypted (AES-256-GCM) and
persisted in `bot_sessions.authStateEncrypted` so the runner can
reconnect on restart without a fresh QR scan.

Real impl arrives in **Fase 3**. The current scaffold provides:
- Bot CRUD in the API (with tenant `maxBots` limit).
- Internal control endpoints on `bot-runner` (`/bots/start`, `/bots/stop`).
- Redis pub/sub channel design (`bot:control`, `bot:events`).

## Kit Digital compliance baseline

Wired in the schema from day 1 so we don't pay later:

- `access_logs` table for per-user access trail (CSV export endpoint).
- `app_versions` table for the public changelog.
- `Tenant.kitDigitalSegment` + `maxUsers` to mirror segment IV (20) / V (25).
- Admin actions auditable via `admin_action_log`.

See [docs/kit-digital](../kit-digital/README.md) for the requirement checklist.
