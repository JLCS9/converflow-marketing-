# converflow-app

Multitenant SaaS platform for AI agents that automate commercial processes (sales, customer service, prospecting, document OCR). Targets compliance with Kit Digital category **"Gestión de Clientes con IA asociada"** (also reusable for "Gestión de Procesos").

**Production**: https://app.converflow.ai (tenant) · https://admin.converflow.ai (super admin) · https://api.converflow.ai (REST).

## Start here

- [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) — single source of truth on what works today, what doesn't, and what's coming.
- [`docs/architecture/README.md`](docs/architecture/README.md) — current architecture (post-Sprint 2.2).
- [`docs/kit-digital/README.md`](docs/kit-digital/README.md) — compliance tracking against Red.es requirements.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Web**: Next.js 15 (App Router, standalone output) + Tailwind
- **API**: NestJS 10 + Fastify 4
- **DB**: Postgres 16 + pgvector + Row Level Security (FORCE)
- **Cache/queues**: Redis 7 + BullMQ (workers stub for now)
- **ORM**: Prisma 6
- **Storage**: Cloudflare R2 (S3-compatible) for documents
- **LLM**: Anthropic Claude API (pending Sprint 3)
- **WhatsApp**: Baileys, multi-session via bot-runner (stub for now, real impl Sprint 5)
- **Auth**: argon2id passwords, separate tenant + super admin stacks, TOTP 2FA for admin

## Layout

```
apps/
├── web/          Next.js — marketing + tenant dashboard + super admin
├── api/          NestJS — REST + multipart upload
├── workers/      BullMQ workers (stub)
└── bot-runner/   Baileys multi-session host (stub)

packages/
├── db/           Prisma schema + RLS policies + seed
├── shared/       Zod schemas, errors, types
└── config/       Shared tsconfig presets

infra/
├── docker/       Dockerfiles + compose (dev + prod)
├── nginx/        Vhost templates (host nginx terminates TLS)
└── scripts/      deploy.sh

docs/
├── CURRENT_STATE.md
├── architecture/
└── kit-digital/
```

## Quick start (local dev — optional)

```bash
pnpm install
cp .env.example .env
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
pnpm infra:dev          # docker compose: postgres + redis
pnpm db:migrate         # prisma db push + apply-rls + seed
pnpm dev                # all apps in parallel
```

- Web → http://localhost:3000
- API → http://localhost:4000
- API docs → http://localhost:4000/docs
- Admin login → http://localhost:3000/admin/login

## Production deploys

The whole platform runs on a single Hostinger VPS in `/opt/converflow-ai/` behind host-level Nginx with Let's Encrypt. To deploy a change:

```bash
cd /opt/converflow-ai
git pull --ff-only
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod \
  build api web   # or whichever services
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod \
  up -d --force-recreate api web
```

See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) "Operational runbook" for schema changes, password resets, and recovery from stuck builds.
