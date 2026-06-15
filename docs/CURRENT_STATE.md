# converflow.ai — Current State Snapshot

> Single source of truth. Update after every sprint. If reading this in a new session, you can skip 100% of conversation history and rely on this file + the repo.

**Last sync:** post-multichannel + agents. **LIVE in prod**: Sprint 7 (WhatsApp Baileys 7), Sprint 8 (Conversaciones inbox with channel-aware reply: text/emoji/documents + one-click AI suggestion send), **Agents v1a/b/d** (self-service builder + playground + tool execution + AUTO mode with AI disclosure + rate limit), **Design v2** (fixed shell, icon sidebar with expandable groups, "Hoy" home), **Web chat** (embeddable widget + agent auto-reply), **Email channel** (Resend system path + tenant **self-service IMAP/SMTP** with encrypted creds + workers IMAP poller), **Lead→Cliente** auto-conversion. (Kit Digital product side complete since Sprint 5: 17/18, #18 user-owned.) **Pending**: Agents v1c RAG (needs embeddings key from user), historical metrics for Hoy home (sparklines/IA-semana), WhatsApp Cloud API upgrade.

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

Stack: pnpm monorepo + Turborepo · Next.js 15 · NestJS 10 + Fastify 4 · Postgres 16 + pgvector + RLS · Redis 7 · Prisma 6 · Tailwind + **lucide-react** · Cloudflare R2 (S3-compatible) · Anthropic Claude (lead scoring + note classification + meeting-slot proposals + agent runtime with tool-use loop LIVE) · Google Calendar OAuth (per-user, LIVE) · WhatsApp via Baileys 7 (bot-runner, LIVE) · **Web chat** embeddable widget (LIVE) · **Email**: Resend for system mail + nodemailer SMTP for tenant outbound + imapflow IMAP poller in workers for tenant inbound (LIVE).

## Containers in prod

| Service | Image | Notes |
|---|---|---|
| cfai-postgres | pgvector/pgvector:pg16 | exposed 127.0.0.1:55432 for host migrations |
| cfai-redis | redis:7-alpine | internal only |
| cfai-api | cfai-api:latest | NestJS, 4000 → 127.0.0.1:8091 |
| cfai-web | cfai-web:latest | Next.js standalone, 3000 → 127.0.0.1:8090 |
| cfai-workers | cfai-workers:latest | BullMQ scaffold (stub workers) + **IMAP poller** for tenant Email connections (fetches new INBOX mail per `EmailConnection` and forwards to `/internal/email/inbound`) |
| cfai-bot-runner | cfai-bot-runner:latest | **Baileys 7** (Sprint 7): per-bot WA socket, QR, encrypted auth state in bot_sessions, auto-reconnect, inbound+OUT echo → API webhook. 4100 → 127.0.0.1:8092 |

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
- ✅ **Dashboard reporting** (req #6): KPIs (leads, tasa de conversión, pipeline abierto €, tareas vencidas) + embudo de leads por estado, oportunidades por etapa, leads por fuente, pipeline abierto por mes de cierre. Una sola llamada `GET /reports/overview` (agregaciones con Prisma groupBy/count dentro de `withTenant`). **Sprint 10**: `GET /reports/series` añade series de 14 días + deltas semana/semana + resumen IA de 7 días (ver ROADMAP Sprint 10)
- ✅ Leads: list/filters/create/detail/status workflow/CSV import
- ✅ **Lead Scoring IA**: POST /leads/:id/score → Claude returns score 0-100 + priority + reasoning + recommended actions; persisted; UI badge + button in lead detail
- ✅ Opportunities: list/pipeline/create/detail/status change/delete. Create form uses **EntityPicker** (search by name, no cuid) + prefill via `?leadId=`/`?clientId=`
- ✅ Clients: list/filters/create/detail
- ✅ Tasks: list/create/status/delete
- ✅ **Notes IA**: add note (link to lead/client/opp) + POST /notes/:id/analyze → Claude classifies (BUY_INTENT/OBJECTION/INFO_REQUEST/COMPLAINT/SCHEDULING/OFF_TOPIC/OTHER) + sentiment + confidence + suggested reply. Prompt fed with full context (lead data, prior notes + their classifications, opportunities, tasks) and instructed to be short + non-repetitive
<!-- Historial IA standalone page removed in design v2 — the per-lead AI history now lives inside the lead's notes (classification + suggested reply per note). -->
- ✅ **Alertas** (req #7, `/app/alerts`): rule engine with 4 rules (lead sin contactar >14d, oportunidad con `expectedCloseDate` vencida, tarea con `dueAt` vencida, lead con score ≥75 sin convertir). Compute-on-read with **diff-only** persistence to the `Alert` table (creates new, updates changed, deletes resolved-but-not-dismissed — steady state is read-only). UI with icons + severity badges + marcar leída/descartar; unread-count badge in the nav. Endpoints: `GET /alerts`, `GET /alerts/count`, `POST /alerts/:id/read`, `/alerts/read-all`, `/alerts/:id/dismiss`
- ✅ **IA Reuniones / Google Calendar** (req #12): per-user OAuth (connect/disconnect in Ajustes). `POST /meetings/propose` reads the user's free/busy + lead context → generates tz-aware business-hours slots (no date lib; `Intl`-based) → Claude picks up to 3 + suggests title/agenda. `POST /meetings/schedule` re-checks the slot is free, creates the Google Calendar event (inviting the lead) + a follow-up MEETING Task. Refresh tokens stored AES-256-GCM encrypted; OAuth `state` is HMAC-signed (cookie-independent). UI: "Reuniones IA" card on the lead detail page
- ✅ Documents: R2 upload/list/presigned download/delete
- ✅ Users, Profile, Settings
- ✅ **Bots / WhatsApp** (Sprint 7, LIVE on Baileys 7): bot CRUD + `/app/bots/[id]` with **Conectar** → QR pairing (polling) → status → **Desconectar**. Per-bot Baileys session in the bot-runner; AES-256-GCM auth state in `bot_sessions`; auto-reconnect on boot. Inbound + our own OUT echoes forwarded to the API. LID→real phone resolved via `key.remoteJidAlt` / `lidMapping.getPNForLID`
- ✅ **Conversaciones / Inbox** (Sprint 8, **LIVE**): `/app/conversations` two-pane bandeja — list (tabs Sin responder / Todas / Cerradas, **live pendientes badge** polling in the nav) + thread (IN/OUT bubbles) + composer with **send text/emoji/documents** + **one-click "Enviar sugerencia IA"** (suggestion appears below the composer). Channel-aware delivery: WhatsApp via bot-runner, WEBCHAT just records OUT (widget polls), EMAIL via tenant SMTP (or Resend fallback). Inbound writes `Conversation`+`Message` and runs the assigned agent (suggest/auto) or generic classifier as fallback. Endpoints: `GET /conversations[/:id|/count]`, `POST /conversations/:id/{send,send-document,read,close,reopen}`.
- ✅ **Web chat channel** (LIVE): embed `<iframe src="https://app.converflow.ai/widget/<botId>">`. Public API `POST/GET /webchat/:botId/messages` (no auth — botId is the widget key + visitor `sessionId` scopes the conversation). The agent auto-replies regardless of mode (it's our own surface); AI disclosure is shown persistently in the widget header.
- ✅ **Email channel** (LIVE, **two paths**):
   - Tenant **self-service IMAP/SMTP** (the user-facing channel, like WhatsApp's connect-your-account): on a Bot of channel EMAIL, `POST /bots/:id/email/connect` verifies SMTP via nodemailer + stores **AES-256-GCM encrypted** creds in `EmailConnection`; the `workers` IMAP poller (imapflow + mailparser, every ~60s) fetches new INBOX mail and forwards to `/internal/email/inbound`; outbound replies (inbox + agent AUTO) send via the tenant's own SMTP.
   - **Converflow Resend path** (system mail + fallback): outbound via Resend from `EMAIL_FROM` with `Reply-To` = the bot's address; inbound webhook `POST /internal/email/inbound` accepts `{to,from,fromName?,subject?,text?,messageId?}`. Used when a tenant hasn't connected their own mailbox (and for future system flows like password reset).
- ✅ **Campañas** (`/app/campaigns`, envíos masivos): crea campañas a grupos de leads/clientes. **1 canal por campaña** (EMAIL ya; WHATSAPP y otros según bot conectado). Audiencia = filtros (entidad lead/cliente/ambos + estados + fuentes + responsable) con **previsualización de recuento en vivo** (`POST /campaigns/preview`) — el ajuste manual de contactos concretos está soportado en backend (`includeLeadIds`/`excludeLeadIds`…) pero aún no en la UI (próximo incremento). El selector de bandeja muestra la **dirección real** desde la que se envía (bot.phoneNumber para EMAIL). La preview devuelve la **lista de contactos** y la UI permite **seleccionar/deseleccionar** (deselecciones → `excludeLeadIds`/`excludeClientIds`). **Apertura de email** trackeada por píxel: emails enviados en **HTML** con `<img>` a `GET /c/o/:token` (HMAC) → `CampaignRecipient.openedAt`/`openCount`; el detalle muestra aperturas por destinatario. Cuerpo tipo plantilla con variables `{nombre}/{first_name}/{email}/{telefono}`. **Envío en la API** (bucle background con rate-limit por canal: EMAIL ~0.6s, WHATSAPP ~4s) — EMAIL por el SMTP del bot (fallback Resend) con **pie de baja**, WHATSAPP por bot-runner. **Programable** (`scheduledAt`) vía un scheduler `setInterval` en la API (`onModuleInit`, claim atómico SCHEDULED→SENDING). **Bajas/RGPD**: tabla `Suppression` (tenant+channel+address); endpoint público `GET /unsubscribe?token=` (HMAC con `AUTH_SECRET`) añade la supresión; las campañas excluyen suprimidos. Permiso `campaigns` (default OWNER/ADMIN). ⚠️ WhatsApp masivo por Baileys = riesgo de baneo (rate-limit agresivo; a escala → Cloud API, Sprint 11).
- ✅ **Soporte / tickets** (atención al cliente): when an agent has Soporte enabled, it can open a **SUPPORT task** — either via the `create_support_task` tool (the AI invokes it on an actionable incidence) or automatically when `escalate_to_human` fires (both triggers). The ticket is **routed to a responsible user** by topic→person rules (`Agent.config.support.routes`: exact topic match → keyword match → `fallbackOwnerId`), the **assignee gets an email** (tenant's own SMTP via the first CONNECTED `EmailConnection`, Resend fallback; sent OUTSIDE the txn per lesson #1, fire-and-forget). Builder has a "Soporte / tickets" section (toggle + default priority + topic→responsible route editor + fallback). Tasks list shows the **Responsable** column + "Soporte" type. Assignable users come from `GET /users/assignable` (RequirePerm `agents`, active users only). `Task.owner` relation + `TaskType.SUPPORT` added.
- ✅ **Agentes IA** (`/app/agents`, **v1a + v1b + v1d LIVE**, self-service): builder with name/description/prompt + quality (Estándar/Rápida) + mode (Sugerir/Auto) + language/tone + **business info / FAQs** with hard "no inventar" guardrail + **AI disclosure** (mandatory) + **tools** toggles (`create_opportunity`, `update_opportunity`, `schedule_meeting`, `escalate_to_human`, `create_support_task`). **Playground** to test prompts. **Tool execution**: when an inbound arrives and the bot has an assigned agent, `AiService.runAgentLoop` runs Claude with the enabled tools → CRM actions execute (opp/task creates, conversation flagged) and the agent's text is delivered. **AUTO mode**: on WhatsApp sends via bot-runner with per-bot per-minute rate-limit + AI disclosure on first outbound; on EMAIL sends via the tenant SMTP. **v1c (RAG)** is pending an embeddings key from the user (recommend OpenAI `text-embedding-3-small`).
- ✅ **Design v2** (LIVE): fixed shell (`h-screen`, only content scrolls), **Lucide** icon nav, global **"Crear"** popover (lead/tarea/oportunidad/bot), **expandable nav groups** (CRM/Trabajo/IA/Configuración with subitems on expand — replaced the prior top-tab submenu), home **"Hoy"** = greeting + KPI strip (real, no sparkline) + "tu cola de hoy" (unanswered conversations + active alerts) + pulso del negocio bars. AI cost/model hidden from UI; policies banner dismissible (localStorage).
- ✅ **Lead → Cliente automation**: when a lead's status flips to `CONVERTED`, it auto-links to an existing client by email or creates one from the lead data (company/name, email, phone, source, owner). The won lead now shows under Clientes.
- ❌ Access logs (admin-only by decision)

### Public pages (Kit Digital)
- ✅ `/changelog`, `/ai-disclosure`, `/privacy`

### Data model
- Tenant-scoped (RLS): Tenant, User, UserSession, TenantInvitation, AccessLog, Bot, BotSession, Agent, Client, Lead, Opportunity, Task, Document, Note, Alert, AiUsage, CalendarConnection, Conversation, Message, **EmailConnection**
- Lead has: score, aiScoreReasoning, aiScoreActions (Json), aiScoredAt, **clientId** (set when CONVERTED → linked/created Client)
- Note / Message AI fields: aiCategory, aiSentiment, aiConfidence, aiSuggestedReply, aiAnalyzedAt
- Channel enum: WHATSAPP, INSTAGRAM, MESSENGER, WEBCHAT, **EMAIL**
- Conversation: per (tenant, channel, contactJid); has emailSubject (for EMAIL reply threading), botId, leadId, status, lastInboundAt/lastOutboundAt, unreadCount, lastMessagePreview
- Message: direction IN/OUT, body, mediaType, waMessageId (reused as the channel-native id — WA msg id, email Message-ID), AI classification fields
- Agent: systemPrompt + model + status (DRAFT/PUBLISHED/ARCHIVED) + `config` JSON (language, tone, businessInfo, faqs, aiDisclosure, tools[], mode SUGGEST/AUTO, **support: { enabled, routes[{topic,keywords[],ownerId}], fallbackOwnerId, defaultPriority }**)
- Task: + `owner` relation (User, onDelete SetNull) and `TaskType.SUPPORT`. Support tickets are `type=SUPPORT, source='agent'` with `ownerId` set by the routing rules.
- **Campaign** (channel, botId, subject, body, status DRAFT/SCHEDULED/SENDING/SENT/CANCELLED/FAILED, scheduledAt, `audience` Json snapshot, counters), **CampaignRecipient** (leadId/clientId + name/address snapshot, status PENDING/SENT/FAILED/SKIPPED, unique [campaignId,address]), **Suppression** (tenant+channel+address, unique). New permission module `campaigns`.
- CalendarConnection (one per user): googleEmail, refreshTokenEnc + accessTokenEnc (AES-256-GCM), accessTokenExpiresAt, scope, calendarId
- EmailConnection (one per EMAIL bot): email, imapHost/Port, smtpHost/Port, username, **passwordEnc (AES-256-GCM)**, secure, status (CONNECTED/ERROR), lastError, lastSeenUid (IMAP cursor)
- Bot: channel + phoneNumber (channel address: phone for WA, email for EMAIL, null for WEBCHAT) + agentId; one BotSession (Baileys auth state) and one EmailConnection optional
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
8. **Internal webhooks must DERIVE the tenant from the resource, never trust the payload.** The bot-runner→API inbound webhook now resolves `tenantId` from the bot row (`bot.tenantId` via bypass) keyed by the `:botId` in the URL — it ignores any `tenantId` in the body. Same pattern for `/internal/email/inbound` (resolves the EMAIL bot by the recipient address, then derives tenantId from that bot). Trusting a caller-supplied tenantId is a cross-tenant routing risk. Tenant-facing routes already derive tenant from the session (TenantAuthGuard). RLS covers every tenant table (verified: only the 4 platform tables lack RLS, by design).
9. **IMAP first sync must NOT import history.** When a tenant connects a new mailbox, the poller sets the UID cursor to the current `mailbox.uidNext - 1` and returns — subsequent ticks only fetch UIDs `> cursor`. If we ever fetched from UID 1 we'd flood `conversations` and `messages` with the entire inbox history (and rack up Claude classification cost). See `apps/workers/src/email-poller.ts`.

## Open known issues

1. `score()` prompt enriched with notes but not yet with opportunities/tasks (analyze() has full context). Pending coherence pass.
2. AI does NOT search the internet — only works with context we pass. Real web enrichment needs a tool (Tavily/Perplexity) — not built.
3. AI usage dashboard for admin not built (data is in `ai_usage`).
4. GHCR build workflow disabled (workflow_dispatch only).
5. Alerts `recompute()` runs on every tenant-area page load (via the nav unread-count call). Writes only on diff, so steady state is just ~5 reads — fine at Pyme scale. If it grows, throttle per-tenant via Redis (we have Redis 7).
6. **Google app verification**: the Calendar OAuth app is in *Testing* mode — only emails added as *test users* can connect. For real Pyme clients, the `calendar.events`/`calendar.freebusy` scopes are "sensitive" and need Google app verification (can take weeks). Start that before onboarding real customers. USER owns this.
7. **Tech debt**: admin 2FA `totpSecret` is still stored in PLAINTEXT (auth-admin.service) despite the comment claiming otherwise. Now that `common/utils/crypto.ts` exists, encrypt it. Not urgent (admin-only table) but should be fixed.
8. **WhatsApp inbound (Phase B) caveats**: lead matching is by phone heuristic (last 9 digits `contains`) — leads stored with odd formatting may create a duplicate; new WA leads store clean digits so subsequent messages match. Every inbound text triggers a Claude classify (fire-and-forget) — fine at Pyme scale, add throttling/dedup (by WA message id) if volume grows. Group chats / status / media-without-caption are skipped (media → lead captured, no note).
9. **WhatsApp ban risk**: Baileys is an unofficial client; AUTO mode on WhatsApp does send autonomously now (per-bot rate-limit + AI disclosure on first contact), but for B2B clients at scale plan to migrate to the official **WhatsApp Cloud API** (ADR #7, scheduled as Sprint 11).
10. **Email polling cadence**: IMAP poller runs every ~60s per `EmailConnection` (not real-time). To reduce latency, switch to **IMAP IDLE** (push) or use Gmail/Microsoft push APIs in a later iteration. First sync of a new mailbox only writes the UID cursor (does NOT import history) so you don't bulk-create thousands of conversations.
11. **Hoy home metrics** (Sprint 10 ✅): the home now renders sparklines +
    week-over-week deltas (Leads / Conversión / Ganado) and a **"Tu IA esta
    semana"** panel, all from `/reports/series` (on-the-fly aggregations, no
    snapshot table). Point-in-time metrics with no event basis (open pipeline,
    tasks overdue) still show NO delta on purpose. `Lead.convertedAt` is the only
    schema add — **a `db push` is required on deploy** (see runbook).
12. **Two email paths exist**: the tenant self-service IMAP/SMTP (the customer-facing channel) vs. the Converflow Resend system path (used for system mail and as a fallback when no `EmailConnection` exists for an EMAIL bot). Document this clearly to tenants during onboarding.
13. **Agents RAG not built (v1c)**: agents currently inject `businessInfo` + `faqs` text into the prompt with a hard "no inventar" guardrail. Real RAG over uploaded documents (pgvector) waits on an embeddings provider key from the user (recommend OpenAI `text-embedding-3-small`, alternative Voyage).
14. **`/reports/overview` funnel uses LEGACY lead statuses**: `reports.service.ts`
    still buckets by `['NEW','CONTACTED','QUALIFIED','CONVERTED','LOST']`, but the
    schema migrated leads to the `LEAD/CLIENT/LOST` triplet (old values kept in the
    enum only for the migration window). So the "Embudo de leads" bars on the Hoy
    home likely render mostly-empty legacy buckets. Fix: bucket by the new triplet
    (and decide whether to keep a richer funnel via `contactedAt`/`qualifiedAt`/
    `convertedAt` stamps). Out of scope for Sprint 10 — flagged, not fixed.
15. **⚠️ EMAIL FEEDBACK LOOP (P1, fix pending)**: the support-ticket assignment
    email (and AUTO email replies) are sent via the tenant's SMTP. If the recipient
    is invalid/undeliverable (real case: a test assignee `jose1@…`) the **bounce
    (Mailer-Daemon) lands back in the polled INBOX**, the IMAP poller re-ingests it
    as a new inbound, the agent runs again → sends again → bounces again → **infinite
    loop** (each cycle = 1 Claude call + 1 SMTP send). Same risk for any auto-reply /
    OOO. Mitigated in the incident by removing the Anthropic key (no AI → no agent).
    **FIX (not yet implemented)**: in `conversation-ingest` skip inbound from our own
    bot addresses + system senders (`mailer-daemon@`, `postmaster@`, `no-reply@`) +
    messages with `Auto-Submitted`/`Precedence: bulk` headers; add a per-conversation
    auto-reply rate cap as a backstop. **Do not enable AUTO email + Soporte broadly
    until this ships.**
16. **Anthropic credit exhaustion tanks ALL AI silently (operational)**: when the
    Anthropic account runs out of credits every call 400s with `invalid_request_error`
    ("credit balance is too low"). The agent loop AND the fallback classifier both
    fail, so inbound processing produces NO suggestion, NO auto-reply and NO tool
    actions — and the only signal is a `WARN` in `cfai-api` logs (looks like "nothing
    happens"). Happened in prod 2026-06. **Mitigations**: enable **Auto-reload** on
    the Anthropic billing page; and (code, pending) detect billing/quota errors
    (400 billing / 429) and surface "IA no disponible" in the UI + optional email
    alert to the owner instead of failing silently.

## Operational runbook

### Deploy
```bash
cd /opt/converflow-ai && git pull --ff-only
# include every service whose code changed in this batch:
#   - api / web: almost always
#   - bot-runner: any WhatsApp/Baileys change
#   - workers: any email IMAP poller change OR a new EmailConnection model field
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod build api web [bot-runner] [workers]
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod up -d --force-recreate api web [bot-runner] [workers]
# verify routes / poller:
docker logs cfai-api         --since 30s 2>&1 | grep "Mapped"
docker logs cfai-workers     --since 30s 2>&1 | grep -i "email poller"
docker logs cfai-bot-runner  --since 30s 2>&1 | grep -iE "listening|connected"
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
DATABASE/REDIS, AUTH_SECRET, **ENCRYPTION_KEY** (64 hex — used everywhere creds/tokens are at rest: `common/utils/crypto.ts` for Calendar + EmailConnection password, `bot-runner/crypto.ts` for Baileys auth state, `workers/crypto.ts` for decrypting EmailConnection password in the poller), S3_* (R2), ANTHROPIC_API_KEY, ANTHROPIC_DEFAULT_MODEL (claude-sonnet-4-6), ANTHROPIC_FAST_MODEL (claude-haiku-4-5), GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_OAUTH_REDIRECT_URI (`https://api.converflow.ai/integrations/google/callback`), **RESEND_API_KEY + EMAIL_FROM** (system mail + Converflow email-channel fallback). **BOT_RUNNER_INTERNAL_TOKEN** (≥16 chars, fail-closed) — shared internal secret used by api↔bot-runner AND workers→api (email inbound webhook). Optional: BOT_RUNNER_URL (default `http://bot-runner:4100`), API_INTERNAL_URL (workers/bot-runner → api, default `http://api:4000`), EMAIL_POLL_INTERVAL_MS (workers IMAP poller, default 60000). Per-tenant SMTP/IMAP credentials are stored encrypted in `email_connections` (NOT env). **WEB_PUBLIC_URL** must point to `https://app.converflow.ai` in prod — it's used to build the deep links in the support-ticket assignment emails (defaults to localhost otherwise).

## ROADMAP

Kit Digital product side has been COMPLETE since Sprint 5 (17/18; #18 = capacitación,
USER-owned). What's listed below is what's shipped + what's queued for product value.
Each sprint ends with a deploy (build affected services → up -d → schema push if
needed) and a manual verification.

### Sprints 4 + 5 ✅ LIVE (Kit Digital reqs #6 #7 #12)
Reporting dashboard + Alerts engine (4 rules, compute-on-read diff-only) and
IA Reuniones (Google Calendar OAuth + slot proposals + event creation). See
old commits for details.

### Sprint 6 — Capacitación / Academy (KD req #18) — ⛔ OUT OF SCOPE
USER handles training content + diploma. Skip.

### Sprint 7 — WhatsApp via Baileys ✅ LIVE
QR via polling. Phase A (real bot-runner, encrypted auth state, auto-reconnect)
and Phase B (inbound → conversation + classify + agent). **Upgraded to Baileys 7**
for LID→real phone (`key.remoteJidAlt` / `lidMapping.getPNForLID`). Phase C
(outbound auto-send) was integrated into **Agents v1d** below (AUTO mode with
rate-limit + AI disclosure).

### Sprint 8 — Conversaciones / Inbox ✅ LIVE
Own `Conversation` + `Message` model + RLS. `ConversationIngestService` (idempotent
by `waMessageId`). Two-pane UI (Sin responder / Todas / Cerradas), thread with
composer (text/emoji/document send) + one-click "Enviar sugerencia IA" below the
composer. Channel-aware delivery (WhatsApp via bot-runner, WEBCHAT records OUT,
EMAIL via tenant SMTP or Resend). Live pendientes badge in nav.

### Agents (multi-increment) ✅ v1a + v1b + v1d LIVE — ⏳ v1c PENDING
Self-service agent builder + playground + tool execution + AUTO mode. Decisions:
per-agent mode toggle (default Suggest), text-knowledge in prompt with hard
"no inventar" guardrail until RAG ships, AI disclosure baked in by default.
- [x] **v1a**: `AgentsModule` CRUD + `/app/agents` UI + playground (`AiService.complete`).
  Bot detail has an agent selector. AI cost/model hidden from UI; the model
  selector is labelled "Calidad de respuesta" (Estándar/Rápida), no model names.
- [x] **v1b — tool execution**: `AiService.runAgentLoop` (multi-turn tool-use loop)
  + `AgentRuntimeService` executes `create_opportunity` / `update_opportunity` /
  `schedule_meeting` (creates a MEETING task) / `escalate_to_human` against the
  tenant + lead. Wired into inbound: assigned agent powers the reply (with tools);
  falls back to the generic classifier if the agent errors.
- [x] **v1d — AUTO mode**: on `WEBCHAT` always auto-delivers (our surface). On
  `WHATSAPP` and `EMAIL` AUTO-only: WhatsApp via bot-runner (per-bot per-minute
  rate-limit + AI disclosure on first outbound); EMAIL via tenant SMTP. Falls
  back to suggestion on rate-limit or transport failure.
- [ ] **v1c — RAG**: pgvector + embeddings provider; index `Agent.config` knowledge
  + tenant documents; retrieve top-k per inbound message; inject into the agent
  prompt. **Blocked on the user creating an embeddings key** (recommend OpenAI
  `text-embedding-3-small`; alternative Voyage). Code-side: a `KnowledgeModule`
  in the api + an `embed` queue handler in workers (we'll reuse the BullMQ
  scaffold).

### Design v2 ✅ LIVE
Fixed shell, Lucide icons, expandable nav groups (replaced top-tab submenu),
global "Crear" popover, "Hoy" home (greeting + KPI strip + tu cola de hoy +
pulso del negocio bars). **Pending pieces deferred to Sprint 10**: sparklines /
week-over-week deltas / "Tu IA esta semana" panel (need historical metrics).

### Channels — multichannel foundation ✅ LIVE
Conversation/Message + agents are channel-agnostic; per channel we add an
adapter (transport + identity). Channels currently live:
- **WhatsApp** (Baileys 7) — see Sprint 7.
- **Web chat** — public widget at `/widget/[botId]` + `/webchat/:botId/messages`
  endpoints; visitor `sessionId` scopes the conversation; agent auto-replies.
- **Email** — TWO paths:
  - **Tenant IMAP/SMTP** (self-service): `EmailConnection` per EMAIL bot with
    AES-256-GCM encrypted creds; `POST /bots/:id/email/connect` verifies SMTP
    (nodemailer); workers IMAP poller (imapflow + mailparser) forwards new
    INBOX mail to `/internal/email/inbound`; outbound via the tenant's SMTP.
  - **Converflow Resend** (system path + fallback): outbound from `EMAIL_FROM`
    with `Reply-To` = the bot's address; inbound webhook accepts a generic JSON
    shape. Used when no `EmailConnection` exists and for future system flows.
- **Lead → Cliente automation**: on lead status `CONVERTED` we link/create a
  Client from the lead's data and set `lead.clientId`. Won leads show under
  Clientes automatically.

### Sprint 9 — Agents v1c RAG ⏳ NEXT (blocked on embeddings key)
- [ ] Add embeddings provider key to `.env.prod` (USER) — recommend OpenAI
  `text-embedding-3-small` (~$0.02 / M tokens, multilingual).
- [ ] `KnowledgeChunk` model (tenantId, agentId or documentId, text, embedding
  vector via pgvector, metadata).
- [ ] Workers `embed` queue: chunk + embed `Agent.config.businessInfo`/`faqs` on
  save; also tenant `Document`s on upload. Re-embed on edit.
- [ ] `AgentRuntimeService` retrieves top-k chunks per inbound message and
  injects them into the prompt under a "FUENTES" section with citations.
- [ ] UI: agent edit shows "Indexado: N fragmentos" + a "re-indexar" button.

### Sprint 10 — Historical metrics + close the Hoy home ✅ LIVE
Decision: **on-the-fly aggregations, NO `metric_snapshots` table, NO cron.** Every
metric we surface has a real event timestamp (`createdAt`, `closedAt`,
`ai_usage.createdAt`); the only gap was conversions, fixed with a single
`Lead.convertedAt` column (stamped in `LeadsService.update` + `scoring.ts` on the
first CLIENT transition). Point-in-time metrics with no event basis (open pipeline,
tasks overdue) deliberately get NO sparkline/delta — consistent with the project's
no-placeholder-data rule.
- [x] `GET /reports/series` — daily buckets over the last 14 calendar days (TZ
  `Europe/Madrid`, bucketed in JS, no date lib) for `leadsCreated`, `conversions`,
  `wonCount`/`wonValue` (Opportunity WON by `closedAt`), `inboundMessages`. Returns
  `{ days, series, deltas (last-7 vs prior-7, pct null when no baseline), aiWeek }`.
- [x] Sparkline (inline SVG, no chart lib) + `DeltaBadge` in `primitives.tsx`;
  `StatCard` extended with optional `spark`/`delta`. Hoy home KPI strip now:
  **Leads** (new-this-week spark + delta), **Conversión** (conversions spark +
  delta), **Ganado** (7-day won € spark + delta; open pipeline moved to its hint),
  **Tareas vencidas** (point-in-time, no delta).
- [x] **"Tu IA esta semana"** panel — conversaciones atendidas (+ % auto-resueltas),
  leads puntuados, reuniones agendadas, escaladas a humano. Derived from `ai_usage`
  over 7 days (`agent_reply` `metadata.{delivered,mode,actions}` + `lead_scoring`).
  Empty-state when the AI hasn't acted (no placeholder numbers).
- ⏳ Deferred: an `expensive` weekly email/notification of these metrics; richer
  charting. Not needed for KD compliance.

### Sprint 11 — WhatsApp Cloud API (official) upgrade
ADR #7: reduce ban risk for production scale. Build a second WHATSAPP adapter
that uses Meta's Cloud API webhook + send (per-bot WABA + phone number id).
Keep Baileys as the dev/SMB path; let tenants choose at bot creation.
- [ ] Meta app + WABA + phone number id per tenant.
- [ ] Webhook receiver (signed) → ingest as WHATSAPP.
- [ ] Outbound via Cloud API (template messages for first-contact / 24h window).

### Sprint 12 — Multichannel polish + onboarding
- [ ] **"Instalar widget"** page (copy-pasteable iframe + script snippet, with
  bot id auto-filled).
- [ ] **IMAP/SMTP presets** in the email-connect form (Gmail, Outlook 365, IONOS,
  Yahoo, custom) so tenants don't have to look up server names.
- [ ] **Microsoft 365 (Graph) one-click** OAuth as an alternative to entering
  app passwords. (Optional: Gmail OAuth too — reuses our Google app, requires
  Google restricted-scope verification.)
- [ ] In-app onboarding checklist per bot ("Connect / Assign agent / Test").

### Sprint 13 — Operational + tech debt
- [ ] Admin **AI-usage dashboard** (cost per tenant; data is in `ai_usage`).
- [ ] Admin **audit-log UI** (data in `admin_action_log`).
- [ ] Encrypt the admin **TOTP secret** (open issue #7) using `common/utils/crypto.ts`.
- [ ] Switch `prisma db push` → proper migrations once schema stabilizes.
- [ ] SSH key auth to VPS (currently Hostinger web terminal only).
- [ ] Re-enable GHCR CI/CD image builds.
- [ ] Keep `CURRENT_STATE.md` in sync after every sprint (it has gone ~7 commits
  behind before; treat this as a definition-of-done).

### Red.es Phase I submission prep — ⛔ OUT OF SCOPE
USER handles memoria técnica, evidence screenshots, and the Red.es submission.

### Backlog (nice-to-have, not blocking)
- Chat assistant per lead/client (conversational Claude with full context).
- Web-search lead enrichment (Tavily/Perplexity tool).
- Real transactional email invites via Resend (replace temp-password-in-UI flow).
- IMAP IDLE / Gmail push to lower email latency below the 60s poll.
- Google app verification for Calendar (move out of Testing — USER-owned).

## COMPLIANCE SCORECARD (Gestión de Clientes con IA)

Working today: reqs 1,2,3,4,5(manual),6,7,8,9,10,11,12,13,14,15,16,17 → **17 of 18**.
PRODUCT side of compliance is **COMPLETE**. The only remaining req is #18 (capacitación
20h + diploma), which is USER-owned and OUT OF SCOPE — same as all Red.es submission prep.
→ Nothing product-side is blocking Kit Digital compliance now. Next priority is Sprint 7
  (WhatsApp Baileys) — the core product value-add, not a strict KD-Clientes requirement.
