# Architecture

Current production architecture (post-Sprint 2.2 + R2→S3 refactor).

## Overview

```
Internet
   │
   ▼ TLS at host nginx (Let's Encrypt, certbot --nginx)
┌─────────────────────────────────────────────────────────────┐
│ Hostinger VPS (Debian 13)                                   │
│                                                             │
│  Nginx (host) on :80/:443                                   │
│   ├── converflow.ai          ─► 127.0.0.1:8090 (web)         │
│   ├── www.converflow.ai      ─► 127.0.0.1:8090               │
│   ├── app.converflow.ai      ─► 127.0.0.1:8090               │
│   ├── admin.converflow.ai    ─► 127.0.0.1:8090               │
│   └── api.converflow.ai      ─► 127.0.0.1:8091 (api)         │
│                                                             │
│  Docker network: converflow_ai_net (bridge, isolated)       │
│   ├─ cfai-web   (Next.js 15 standalone)                     │
│   ├─ cfai-api   (NestJS + Fastify, exposed 127.0.0.1:8091)   │
│   ├─ cfai-postgres (pgvector/pg16, exposed 127.0.0.1:55432) │
│   ├─ cfai-redis (alpine, internal only)                     │
│   ├─ cfai-workers (BullMQ, internal only — stub)            │
│   └─ cfai-bot-runner (Fastify, exposed 127.0.0.1:8092 — stub) │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
        S3-compatible storage (Cloudflare R2 today)
              │
              ▼
        Anthropic Claude API (pending Sprint 3)
```

> Other unrelated projects also run on this VPS (`vl-*`, `focuson-*`, `n8n-*`, `wordpress-*`, `converflow.tech`). They do NOT share `converflow_ai_net`.

## Repo layout

```
converflow-app/
├── apps/
│   ├── api/         NestJS + Fastify HTTP API
│   ├── web/         Next.js 15 (landing + tenant + admin)
│   ├── workers/     BullMQ workers (stubs)
│   └── bot-runner/  Baileys multi-session host (stub)
├── packages/
│   ├── db/          Prisma schema, RLS, seed
│   ├── shared/      Zod schemas, errors, types
│   └── config/      tsconfig presets
├── infra/
│   ├── docker/      Dockerfiles + compose
│   ├── nginx/       vhost templates
│   └── scripts/     deploy.sh
└── docs/
    ├── CURRENT_STATE.md   ◄ start here
    ├── architecture/      this file
    └── kit-digital/       Red.es compliance tracking
```

## Multitenancy — Postgres RLS

Pool model. Every tenant-scoped table has a `tenantId` column (camelCase, **quoted** in SQL: `"tenantId"`).

Session vars driving policies:

| Variable | Set by | Meaning |
|---|---|---|
| `app.tenant_id` | API per-request via `withTenant()` | Current tenant scope |
| `app.bypass_rls` | API admin operations via `bypass()` | When `'on'`, RLS is skipped (super admin, migrations) |

Policy shape:
```sql
CREATE POLICY tenant_isolation ON <table>
FOR ALL
USING (rls_bypass_enabled() OR "tenantId" = current_tenant_id())
WITH CHECK (rls_bypass_enabled() OR "tenantId" = current_tenant_id());
```

`ALTER TABLE … FORCE ROW LEVEL SECURITY` ensures the policy applies even to the table owner.

Helpers in `packages/db/src/rls.ts`:
- `withTenant(prisma, tenantId, fn)` — opens transaction, sets `app.tenant_id`, runs work.
- `withRlsBypass(prisma, fn)` — opens transaction with bypass=on. For super admin reads and migrations.

The API's `PrismaService` exposes these as `.withTenant(...)` and `.bypass(...)`.

## Auth model

Two completely independent stacks:

| Aspect | Tenant users | Super admin |
|---|---|---|
| Table | `users` (per-tenant) | `platform_admins` |
| Cookie | `cf_tenant_session` | `cf_admin_session` |
| 2FA | not yet | TOTP via otplib |
| First-login flow | password change forced | password change forced |
| Cookie domain (prod) | `.converflow.ai` | `.converflow.ai` |

Login response includes `mustChangePassword`. Login forms redirect to `/(app|admin)/profile` when true. The change-password endpoint invalidates ALL existing sessions including the current one.

`User.email` is **globally unique** across tenants (Option B). The DB constraint enforces it; the API still does a `findFirst({where:{email}})` as belt-and-suspenders before creates.

## Storage (S3-compatible)

`S3Service` (`apps/api/src/common/storage/s3.service.ts`) is a thin AWS S3 SDK wrapper that talks to any S3-compatible store. Currently configured against Cloudflare R2 in production, but the same code works for AWS S3, Backblaze B2, MinIO, Wasabi, etc.

- Object keys: `tenant/<tenantId>/document/<docId>/<filename>` (filename sanitized).
- Uploads via `@fastify/multipart` (50 MB cap).
- Downloads served as **presigned URLs**, 10-minute TTL — bucket stays private.
- `forcePathStyle` enabled when endpoint is not AWS (R2 / MinIO need it).

Env vars (in `infra/docker/.env.prod` only):

| Var | R2 | AWS S3 |
|---|---|---|
| `S3_ENDPOINT` | `https://<accountId>.r2.cloudflarestorage.com` | _leave empty_ |
| `S3_REGION` | `auto` | `eu-west-1` (or your region) |
| `S3_ACCESS_KEY_ID` | from R2 API token | from IAM |
| `S3_SECRET_ACCESS_KEY` | from R2 API token | from IAM |
| `S3_BUCKET` | `converflow-docs` | your bucket name |

## API surface (summary)

### Public
- `GET /health`
- `GET /app-versions`

### Tenant auth (cookie `cf_tenant_session`)
- `POST /auth/login`, `/auth/signup`, `/auth/logout`, `/auth/me`, `/auth/change-password`
- `GET /me/tenant`, `/me/stats`
- `GET /users`, `POST /users/invite`, `PATCH /users/:id`, `DELETE /users/:id`
- `GET /leads`, `POST /leads`, `GET /leads/:id`, `PATCH /leads/:id`, `DELETE /leads/:id`, `POST /leads/import`
- `GET /opportunities`, `GET /opportunities/pipeline`, `GET /opportunities/:id`, `POST /opportunities`, `PATCH /opportunities/:id`, `DELETE /opportunities/:id`
- `GET /clients`, `POST /clients`, `GET /clients/:id`, `PATCH /clients/:id`, `DELETE /clients/:id`
- `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`
- `GET /documents`, `POST /documents/upload` (multipart), `GET /documents/:id/download`, `DELETE /documents/:id`
- `GET /bots`, `POST /bots`

### Admin (cookie `cf_admin_session`, optional TOTP at login)
- `POST /admin/auth/login`, `/logout`, `/me`, `/change-password`, `/2fa/enroll`, `/2fa/verify`
- `GET /admin/stats`
- `GET /admin/tenants`, `GET /admin/tenants/:id`, `POST /admin/tenants`, `PATCH /admin/tenants/:id/limits`, `DELETE /admin/tenants/:id`
- `GET /admin/bots` (cross-tenant)
- `GET /admin/access-logs`, `GET /admin/access-logs/export.csv`

## What's deliberately NOT here

- **Traefik**: not used. Host Nginx does TLS termination on :80/:443.
- **GHCR images**: images are built on the VPS (`docker compose build`). `.github/workflows/build-images.yml` is `workflow_dispatch` only.
- **Helm / k8s**: single-host docker compose. Move to k8s post-product-market-fit, not before.
- **Self-service Stripe billing**: super admin sets limits manually.
- **Resend integration**: temp passwords still shown in UI. Will move to email in Sprint 3.

## ADRs worth remembering

1. **Pool multitenancy + RLS** (not schema-per-tenant). Single migration path, scales horizontally.
2. **Email globally unique** (Option B). Prevents login ambiguity; "one user, one tenant" is acceptable for B2B.
3. **Temp passwords with restricted alphabet** (no `O`, `0`, `I`, `l`, `_`, `-`). Avoids clipboard mangling.
4. **`prisma db push` instead of migrations**. Faster iteration; switch to `migrate dev` once schema stabilizes.
5. **Server-side rendering for tenant/admin pages** with cookie forwarding via `serverApiFetch`. Tighter security than client-only SPA.
6. **Multi-candidate password verify** (`auth.service.ts.login`). When multiple users share an email across tenants (currently disabled by unique constraint), the code is still defensive.
7. **Provider-agnostic S3** (Sprint 2.2 cleanup). Code reads `S3_*` env vars; works against R2, AWS S3, B2, MinIO, etc. — same code, different endpoint.
