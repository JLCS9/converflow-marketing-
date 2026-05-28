# converflow.ai — Current State Snapshot

> Single source of truth. Update after every sprint. If reading this in a new session, you can skip 100% of conversation history and rely on this file + the repo.

**Last sync:** end of Sprint 5 — IA Reuniones (Google Calendar) live & verified in prod (req #12 closed). PRODUCT side of Kit Digital now complete (17/18; #18 user-owned).

> **Cross-tenant isolation:** ✅ FIXED & VERIFIED. API now connects as non-superuser
> `converflow_app` so RLS is enforced. A new tenant sees ONLY its own data. This was
> a P0 leak (superuser bypassed RLS) — see lesson #0 below. If you ever rebuild the DB
> from scratch, you MUST run `create-app-role.sql` + point DATABASE_URL at `converflow_app`
> or the leak returns.

## TL;DR — what works in prod today

Production lives on Hostinger VPS `srv1433126.hstgr.cloud` (`187.77.166.246`), Debian 13, isolated Docker network `converflow_ai_net`. Nginx host-level fronts 80/443 (shared with other unrelated projects). TLS via Let's Encrypt on `converflow.ai` + 4 subdomains.

URLs:
- `https://converflow.ai` — landing (Next.js)
- `https://app.converflow.ai` — tenant area (auth required)
- `https://admin.converflow.ai` — super admin (auth required + 2FA available)
- `https://api.converflow.ai` — REST API
- `https://api.converflow.ai/docs` — Swagger (dev only)

Stack: pnpm monorepo + Turborepo · Next.js 15 · NestJS 10 + Fastify 4 · Postgres 16 + pgvector + RLS · Redis 7 · Prisma 6 · Tailwind · Cloudflare R2 (S3-compatible) · Anthropic Claude (lead scoring + note classification + meeting-slot proposals LIVE) · Google Calendar OAuth (per-user, LIVE).

## Containers in prod

| Service | Image | Notes |
|---|---|---|
| cfai-postgres | pgvector/pgvector:pg16 | exposed 127.0.0.1:55432 for host migrations |
| cfai-redis | redis:7-alpine | internal only |
| cfai-api | cfai-api:latest | NestJS, 4000 → 127.0.0.1:8091 |
| cfai-web | cfai-web:latest | Next.js standalone, 3000 → 127.0.0.1:8090 |
| cfai-workers | cfai-workers:latest | BullMQ stub (no real workloads yet) |
| cfai-bot-runner | cfai-bot-runner:latest | Baileys stub, 4100 → 127.0.0.1:8092 |

> Traefik is defined in compose but NOT used — host Nginx terminates TLS.

## Feature coverage

### Platform / infra
- ✅ Monorepo apps/{api,web,workers,bot-runner} + packages/{db,shared,config}
- ✅ Postgres RLS (pool model, FORCE) — `withTenant()` per request, `bypass()` for admin
- ✅ Email globally unique on `User.email` (Option B)
- ✅ S3-compatible storage (Cloudflare R2) for documents (50 MB max)
- ✅ Anthropic Claude integration (`AiService`, tool-use structured output, cost tracking)
- ✅ Nginx vhosts + Let's Encrypt for 5 hostnames

### Auth
- ✅ Tenant + admin separate stacks, argon2id, cookies on `.converflow.ai`
- ✅ Multi-candidate password verify, force-change-on-first-login, sessions invalidated on change
- ✅ Admin 2FA TOTP (otplib + QR)

### Super admin (admin.converflow.ai/admin)
- ✅ Dashboard, Tenants CRUD + edit limits + delete, Bots global view, Access logs cross-tenant + CSV, Profile + 2FA
- ⏳ Audit log UI (data in `admin_action_log`), AI usage dashboard

### Tenant area (app.converflow.ai/app)
- ✅ **Dashboard reporting** (req #6): KPIs (leads, tasa de conversión, pipeline abierto €, tareas vencidas) + embudo de leads por estado, oportunidades por etapa, leads por fuente, pipeline abierto por mes de cierre. Una sola llamada `GET /reports/overview` (agregaciones con Prisma groupBy/count dentro de `withTenant`)
- ✅ Leads: list/filters/create/detail/status workflow/CSV import
- ✅ **Lead Scoring IA**: POST /leads/:id/score → Claude returns score 0-100 + priority + reasoning + recommended actions; persisted; UI badge + button in lead detail
- ✅ Opportunities: list/pipeline/create/detail/status change/delete. Create form uses **EntityPicker** (search by name, no cuid) + prefill via `?leadId=`/`?clientId=`
- ✅ Clients: list/filters/create/detail
- ✅ Tasks: list/create/status/delete
- ✅ **Notes IA**: add note (link to lead/client/opp) + POST /notes/:id/analyze → Claude classifies (BUY_INTENT/OBJECTION/INFO_REQUEST/COMPLAINT/SCHEDULING/OFF_TOPIC/OTHER) + sentiment + confidence + suggested reply. Prompt fed with full context (lead data, prior notes + their classifications, opportunities, tasks) and instructed to be short + non-repetitive
- ✅ **Historial IA** (`/app/ai-history`): all analyzed notes grouped by day, category filter, expandable
- ✅ **Alertas** (req #7, `/app/alerts`): rule engine with 4 rules (lead sin contactar >14d, oportunidad con `expectedCloseDate` vencida, tarea con `dueAt` vencida, lead con score ≥75 sin convertir). Compute-on-read with **diff-only** persistence to the `Alert` table (creates new, updates changed, deletes resolved-but-not-dismissed — steady state is read-only). UI with icons + severity badges + marcar leída/descartar; unread-count badge in the nav. Endpoints: `GET /alerts`, `GET /alerts/count`, `POST /alerts/:id/read`, `/alerts/read-all`, `/alerts/:id/dismiss`
- ✅ **IA Reuniones / Google Calendar** (req #12): per-user OAuth (connect/disconnect in Ajustes). `POST /meetings/propose` reads the user's free/busy + lead context → generates tz-aware business-hours slots (no date lib; `Intl`-based) → Claude picks up to 3 + suggests title/agenda. `POST /meetings/schedule` re-checks the slot is free, creates the Google Calendar event (inviting the lead) + a follow-up MEETING Task. Refresh tokens stored AES-256-GCM encrypted; OAuth `state` is HMAC-signed (cookie-independent). UI: "Reuniones IA" card on the lead detail page
- ✅ Documents: R2 upload/list/presigned download/delete
- ✅ Users, Bots, Profile, Settings
- ❌ Access logs (admin-only by decision)

### Public pages (Kit Digital)
- ✅ `/changelog`, `/ai-disclosure`, `/privacy`

### Data model
- Tenant-scoped (RLS): Tenant, User, UserSession, TenantInvitation, AccessLog, Bot, BotSession, Agent, Client, Lead, Opportunity, Task, Document, Note, Alert, AiUsage, **CalendarConnection**
- Lead has: score, aiScoreReasoning, aiScoreActions (Json), aiScoredAt
- Note has: aiCategory, aiSentiment, aiConfidence, aiSuggestedReply, aiAnalyzedAt
- CalendarConnection (one per user, @unique userId): googleEmail, refreshTokenEnc + accessTokenEnc (AES-256-GCM), accessTokenExpiresAt, scope, calendarId
- Platform (no RLS): PlatformAdmin, PlatformAdminSession, AdminActionLog, AppVersion

### Kit Digital — Gestión de Clientes con IA
| Requisito | Estado |
|---|---|
| Min usuarios (10/15) | ✅ |
| Gestión clientes / leads / oportunidades / tareas | ✅ |
| Reporting | ✅ (dashboard agregado: KPIs + embudo + pipeline) |
| Alertas gráficas | ✅ (motor de reglas + UI iconos/severidad) |
| Gestión documental | ✅ (R2) |
| Web responsive | ✅ |
| Integración APIs | ✅ |
| IA Lead Scoring | ✅ |
| IA Journeys de venta (clasificación + respuesta) | ✅ |
| IA Reuniones | ✅ (Google Calendar OAuth + IA propone slots + crea evento/tarea) |
| IA RGPD / AI Act / aviso | ✅ |
| Logs acceso en BD | ✅ (admin-only) |
| Capacitación 20h + diploma | ❌ (Sprint 6) |

## CRITICAL lessons (don't repeat these bugs)

0. **The API must connect as a NON-superuser role (`converflow_app`).** The
   default `converflow` user (POSTGRES_USER) is a SUPERUSER, and superusers
   bypass RLS entirely — so tenant data leaked across tenants until we added
   `converflow_app` (NOSUPERUSER NOBYPASSRLS). DATABASE_URL → `converflow_app`
   (runtime, RLS enforced); DATABASE_DIRECT_URL → `converflow` (migrations via
   Prisma directUrl). Role created by `packages/db/prisma/sql/create-app-role.sql`.
   Verify isolation after any DB rebuild: `SELECT rolsuper FROM pg_roles WHERE
   rolname='converflow_app'` must be `f`.
1. **AI calls must NEVER be inside a Prisma transaction.** `withTenant()` opens an interactive transaction with a 5s timeout; Claude takes 5-15s → "Transaction already closed". Pattern: fetch (txn) → AI call (no txn) → save (txn). See `LeadsService.score` / `NotesService.analyze`.
2. **`apiFetch` must not send `content-type: application/json` on bodyless POSTs** — Fastify rejects with `FST_ERR_CTP_EMPTY_JSON_BODY`. Already handled in `api-client.ts`.
3. **Editing `app.module.ts` imports is error-prone** — a NotesModule import silently failed to apply twice; always `grep NotesModule app.module.ts` after. A module's controller routes only register if the module is in `imports[]`.
4. **Docker layer cache serves stale code** — after pulling, if `dist/` in the container doesn't match source, rebuild `--no-cache`. Verify with `docker logs cfai-api | grep "Mapped"`.
5. **Next.js standalone needs static/public copied** (done in web.Dockerfile). Without it, JS chunks 404 and forms fall back to native GET (leaks form fields in URL).
6. **prisma camelCase columns need quotes in raw SQL**: `"tenantId"` not `tenant_id`.
7. **Never paste secrets in chat.** Edit `infra/docker/.env.prod` directly on the VPS via nano. Verify with `grep -E '^X_' .env.prod | awk -F= '{print $1"=*** ("length($2)" chars)"}'`.

## Open known issues

1. `score()` prompt enriched with notes but not yet with opportunities/tasks (analyze() has full context). Pending coherence pass.
2. AI does NOT search the internet — only works with context we pass. Real web enrichment needs a tool (Tavily/Perplexity) — not built.
3. AI usage dashboard for admin not built (data is in `ai_usage`).
4. GHCR build workflow disabled (workflow_dispatch only).
5. Alerts `recompute()` runs on every tenant-area page load (via the nav unread-count call). Writes only on diff, so steady state is just ~5 reads — fine at Pyme scale. If it grows, throttle per-tenant via Redis (we have Redis 7).
6. **Google app verification**: the Calendar OAuth app is in *Testing* mode — only emails added as *test users* can connect. For real Pyme clients, the `calendar.events`/`calendar.freebusy` scopes are "sensitive" and need Google app verification (can take weeks). Start that before onboarding real customers. USER owns this.
7. **Tech debt**: admin 2FA `totpSecret` is still stored in PLAINTEXT (auth-admin.service) despite the comment claiming otherwise. Now that `common/utils/crypto.ts` exists, encrypt it. Not urgent (admin-only table) but should be fixed.

## Operational runbook

### Deploy
```bash
cd /opt/converflow-ai && git pull --ff-only
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod build api web
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod up -d --force-recreate api web
# verify routes: docker logs cfai-api --since 30s 2>&1 | grep "Mapped"
```

### Schema changes
```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod \
  run --rm --no-deps -v /opt/converflow-ai/packages/db/prisma:/repo/packages/db/prisma:ro \
  api sh -c "cd /repo && pnpm --filter @converflow/db push"
```

### Reset password (last resort)
Write a `.cjs` to `/repo/apps/api/`, `require('@converflow/db')` + `require('argon2')`, run via `docker exec cfai-api node ...`. Never via /tmp (module resolution fails).

### Stuck build
`docker compose ... build --no-cache <svc>`; if needed `docker rmi -f cfai-<svc>:latest` first.

### Secrets in .env.prod (on VPS only)
DATABASE/REDIS, AUTH_SECRET, ENCRYPTION_KEY, S3_* (R2), ANTHROPIC_API_KEY, ANTHROPIC_DEFAULT_MODEL (claude-sonnet-4-6), ANTHROPIC_FAST_MODEL (claude-haiku-4-5), **GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI** (= `https://api.converflow.ai/integrations/google/callback`, must match the Google Cloud OAuth client exactly). ENCRYPTION_KEY (64 hex) now actually used by `common/utils/crypto.ts` for calendar tokens.

## ROADMAP TO FULL KIT DIGITAL COMPLIANCE

What's left to have every "Gestión de Clientes con IA" requirement working + ready
for Red.es Phase I submission. Ordered by priority. Each sprint ends with a deploy
(build api/web → up -d → schema push if needed) and a manual verification.

### Sprint 3.3 — AI coherence (small, no deps)
- [ ] Enrich `LeadsService.score()` prompt with opportunities + tasks (currently only notes). Makes scoring consistent with note analysis.
- [ ] (optional) Auto-create a Task when a note is classified BUY_INTENT ("Llamar urgente") or SCHEDULING ("Agendar reunión") — closes the journey loop (req #5 auto-workflow + #13).

### Sprint 4 — Reporting dashboard + Alerts engine (reqs #6 + #7) ✅ DONE (live in prod)
- [x] Tenant dashboard with real aggregations: lead funnel by status, conversion rate, open pipeline value + by month, opportunities by stage, tasks pending/overdue, leads by source. `ReportsModule` → `GET /reports/overview`.
- [x] Alerts engine: 4 rules (lead sin contactar >14d, opp con expectedCloseDate vencida, task overdue, lead con score ≥75). **Compute-on-read with diff-only persistence** to the `Alert` table (no BullMQ worker — kept simple; recompute is read-only in steady state). `AlertsModule`.
- [x] Alerts UI: `/app/alerts` page with icons + severity badges + marcar leída/descartar, and unread-count badge in the tenant nav. (No separate schema change — `Alert` model already had every field.)

### Sprint 5 — IA Reuniones (req #12) ✅ DONE (live & verified in prod)
- [x] Google Cloud project + OAuth client/consent (USER set up; creds in .env.prod). App still in *Testing* mode — needs verification before non-test-user clients (see open issue #6).
- [x] Connect Google Calendar **per user** (OAuth flow): `IntegrationsModule` — connect/callback/status/disconnect, HMAC-signed state, AES-256-GCM token storage, auto refresh.
- [x] Schedule meeting from a lead: `MeetingsModule` — `propose` (tz-aware free slots via `Intl`, Claude picks 3 + title/agenda), `schedule` (conflict re-check + create event inviting the lead + follow-up Task). UI on the lead detail page + connect card in Ajustes.

### Sprint 6 — Capacitación / Academy (req #18) — ⛔ OUT OF SCOPE
> The USER handles capacitación, diploma, and all training content themselves.
> Do NOT build this. Skip entirely.

### Sprint 7 — WhatsApp Baileys (product core, originally promised; not a strict KD-Clientes req but key value)
- [ ] Real bot-runner: spawn Baileys session per Bot, QR via SSE to UI, persist encrypted auth state, auto-reconnect.
- [ ] Inbound messages → create/update Lead + auto-classify (reuse `AiService.classifyNote`).
- [ ] Outbound: send suggested reply with rate-limit + warm-up (anti-ban).

### Sprint 8 — Red.es Phase I submission prep — ⛔ OUT OF SCOPE
> The USER handles memoria técnica, evidence screenshots, and the Red.es
> submission themselves. Do NOT build/prepare these. Skip entirely.

### Backlog (nice-to-have, not blocking compliance)
- Admin AI-usage dashboard (cost per tenant; data in `ai_usage`).
- Admin audit-log UI (data in `admin_action_log`).
- Chat assistant per lead/client (conversational Claude with full context).
- Web-search lead enrichment (Tavily/Perplexity tool).
- Resend transactional email (replace temp-password-in-UI with email invites).
- Switch `prisma db push` → proper migrations once schema stabilizes.
- SSH key auth to VPS (currently Hostinger web terminal only).
- Re-enable GHCR CI/CD image builds.

## COMPLIANCE SCORECARD (Gestión de Clientes con IA)

Working today: reqs 1,2,3,4,5(manual),6,7,8,9,10,11,12,13,14,15,16,17 → **17 of 18**.
PRODUCT side of compliance is **COMPLETE**. The only remaining req is #18 (capacitación
20h + diploma), which is USER-owned and OUT OF SCOPE — same as all Red.es submission prep.
→ Nothing product-side is blocking Kit Digital compliance now. Next priority is Sprint 7
  (WhatsApp Baileys) — the core product value-add, not a strict KD-Clientes requirement.
