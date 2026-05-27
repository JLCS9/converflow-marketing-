# converflow.ai — Current State Snapshot

> Single source of truth. Update after every sprint. If reading this in a new session, you can skip 100% of conversation history and rely on this file + the repo.

**Last sync:** end of Sprint 2.2 (documents + R2)

## TL;DR — what works in prod today

Production lives on Hostinger VPS `srv1433126.hstgr.cloud` (`187.77.166.246`), Debian 13, isolated Docker network `converflow_ai_net`. Nginx host-level fronts 80/443 (shared with other unrelated projects). TLS via Let's Encrypt on `converflow.ai` + 4 subdomains.

URLs:
- `https://converflow.ai` — landing (Next.js)
- `https://app.converflow.ai` — tenant area (auth required)
- `https://admin.converflow.ai` — super admin (auth required + 2FA available)
- `https://api.converflow.ai` — REST API
- `https://api.converflow.ai/docs` — Swagger (dev only)

Stack: pnpm monorepo + Turborepo · Next.js 15 · NestJS 10 + Fastify 4 · Postgres 16 + pgvector + RLS · Redis 7 · Prisma 6 · Tailwind · Cloudflare R2 (S3) · Anthropic Claude (pending Sprint 3).

## Containers in prod

| Service | Image tag | Notes |
|---|---|---|
| cfai-traefik | — | NOT used; Nginx host does TLS instead |
| cfai-postgres | pgvector/pgvector:pg16 | exposed on 127.0.0.1:55432 for host migrations |
| cfai-redis | redis:7-alpine | internal only |
| cfai-api | cfai-api:latest | NestJS, port 4000 → 127.0.0.1:8091 |
| cfai-web | cfai-web:latest | Next.js standalone, port 3000 → 127.0.0.1:8090 |
| cfai-workers | cfai-workers:latest | BullMQ stub (no real workloads yet) |
| cfai-bot-runner | cfai-bot-runner:latest | Baileys stub on port 4100 → 127.0.0.1:8092 |

## Feature coverage

### Platform / infra
- ✅ Monorepo with apps/{api,web,workers,bot-runner} + packages/{db,shared,config}
- ✅ pnpm + Turborepo + tsc + standalone Next.js
- ✅ Postgres RLS (pool model, FORCE) — `withTenant()` per request, `bypass()` for admin
- ✅ Email globally unique on `User.email` (Option B)
- ✅ Cloudflare R2 storage for documents (50 MB max)
- ✅ Nginx vhosts + Let's Encrypt for 5 hostnames
- ✅ CSP, helmet, CORS allowlist (app + admin origins)

### Auth
- ✅ Tenant auth: email + password (argon2id), session cookie `cf_tenant_session` (domain `.converflow.ai`, secure, httpOnly, sameSite=lax)
- ✅ Admin auth: separate `platform_admins` table, cookie `cf_admin_session`
- ✅ Multi-candidate password verify (when same email exists in N tenants we try the password against each)
- ✅ Force password change on first login (`mustChangePassword` flag)
- ✅ Password change endpoints invalidate all sessions
- ✅ Admin 2FA TOTP (otplib + QR via qrcode npm)

### Super admin (admin.converflow.ai/admin)
- ✅ Dashboard with platform stats
- ✅ Tenants: list + create + detail + edit limits + delete (cascade)
- ✅ Bots global view (cross-tenant) with status/tenant filters
- ✅ Access logs (Kit Digital evidence) cross-tenant + CSV export
- ✅ Profile: change password + enroll 2FA TOTP with QR
- ⏳ Audit log UI (data is in `admin_action_log`, just no UI yet)

### Tenant area (app.converflow.ai/app)
- ✅ Dashboard with usage vs limits
- ✅ Leads: list + filters (status, search) + create + detail + status workflow + CSV import
- ✅ Opportunities: list + pipeline 5-stage visual + create + detail + status/probability change + delete
- ✅ Clients: list + filters + create + detail with associated leads/opps/tasks
- ✅ Tasks: list + create with vincular a lead/cliente/opp + change status inline + auto-stamp `completedAt`
- ✅ Documents: upload to R2 (multipart) + list + presigned download (10 min) + delete
- ✅ Users: list + invite (admin/owner only) + remove
- ✅ Bots: list + create (status PENDING until Baileys is real)
- ✅ Profile: change password
- ✅ Settings: tenant info + plan limits (read-only)
- ❌ Access logs (moved to admin-only per user request)

### Public pages (Kit Digital compliance baseline)
- ✅ `/changelog` — reads `AppVersion` table
- ✅ `/ai-disclosure` — AI Act compliance text
- ✅ `/privacy` — RGPD + LOPDGDD policy

### Data model
- Tenant-scoped (RLS enforced): Tenant, User, UserSession, TenantInvitation, AccessLog, Bot, BotSession, Agent, Client, Lead, Opportunity, Task, Document, Note, Alert
- Platform (no RLS): PlatformAdmin, PlatformAdminSession, AdminActionLog, AppVersion

### Kit Digital — Gestión de Clientes con IA

| Requisito | Estado | Implementación |
|---|---|---|
| Min usuarios suministrados (10/15 por segmento IV/V) | ✅ | `Tenant.maxUsers` enforce en create + updateLimits |
| Gestión de clientes | ✅ | Client model + UI |
| Gestión de clientes potenciales | ✅ | Lead model + manual + CSV import |
| Gestión de oportunidades | ✅ | Opportunity + 5-stage pipeline |
| Acciones / tareas comerciales | ✅ | Task model + UI (auto-workflow pendiente Sprint 3) |
| Reporting / planificación | 🟡 | Pipeline básico, falta dashboard de aggregations completo |
| Alertas gráficas | ❌ | Schema `Alert` ya, falta engine + UI |
| Gestión documental | ✅ | Documents en R2 |
| Web responsive (3 dispositivos) | ✅ | Tailwind responsive |
| Integración APIs / WS / ficheros | ✅ | REST documentado en Swagger |
| IA — Lead Scoring predictivo | ❌ | Sprint 3 |
| IA — Automatización reuniones | ❌ | Sprint 4 (Google Calendar OAuth) |
| IA — Automatización journeys de venta | ❌ | Sprint 3 |
| IA — Integración con la plataforma | ✅ | (cubierto vía REST) |
| IA — RGPD / AI Act | ✅ | `/privacy` + `/ai-disclosure` + banner persistente en `/app/*` |
| IA — Aviso uso de IA | ✅ | Banner en layout `/app/(authed)` |
| Logs de acceso por usuario en BD | ✅ | `access_logs` (admin-only por decisión Sprint 2.1) |
| Versiones / changelog | ✅ | `/changelog` |
| Capacitación 20h + diploma | ❌ | Sprint 6 (academy) |

## Open known issues / discrepancies

1. **turbo.json globalEnv has `S3_*` not `R2_*`**. The code in `apps/api/src/config/env.ts` and `r2.service.ts` reads `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_BASE`. The `S3_*` entries in turbo.json are inert (no code reads them). Either:
   - Remove the S3_* entries from turbo.json globalEnv, OR
   - Rename the code to S3_* (more generic, works for any S3-compatible store) and update `.env.prod` accordingly.
2. **`docker-compose.prod.yml` does not propagate R2_* env vars to the api service explicitly** — they come via `env_file: ./.env.prod`. If anyone wonders why upload works, that's the path.
3. **`docs/architecture/README.md` is outdated** vs current architecture (mentions Traefik which we don't use). Should be rewritten.

## Operational runbook

### Connect to VPS
Hostinger web terminal as `root`. SSH key auth not yet set up.

### Deploy a code change
```bash
cd /opt/converflow-ai
git pull --ff-only
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod \
  build api web   # or other services
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod \
  up -d --force-recreate api web
```

### Apply DB schema changes
```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod \
  run --rm --no-deps \
  -v /opt/converflow-ai/packages/db/prisma:/repo/packages/db/prisma:ro \
  api sh -c "cd /repo && pnpm --filter @converflow/db push"
```
This runs `prisma db push --accept-data-loss && apply-rls`. Schema is enforced by Prisma `db push`; RLS by `prisma db execute --file rls-policies.sql`.

### Reset a password (last-resort)
Documented as `/tmp/reset-pass-v2.cjs` pattern in conversation. Use only via `docker exec`, never paste creds in chat.

### Recover from a stuck build
- `docker compose ... build --no-cache <service>` to skip layer cache.
- `docker rmi -f cfai-<service>:latest` before rebuild to be sure.

## Sprint plan (live)

- **Sprint 2.3** (next): Reporting tenant dashboard with real aggregations + alerts engine + UI. No external deps.
- **Sprint 3**: AI — Lead Scoring + Sales Journeys. Requires `ANTHROPIC_API_KEY` in `.env.prod`.
- **Sprint 4**: Google Calendar OAuth for meeting automation.
- **Sprint 5**: Baileys real bot-runner + QR enrollment from UI.
- **Sprint 6**: Capacitación / Academy module for Kit Digital evidence.

## Memory files (for new Claude sessions)

- `~/.claude/.../memory/project_converflow_ai.md` — high-level project context.
- This file — full technical state.
- The repo itself — source of truth for everything code-related.
