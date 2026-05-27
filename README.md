# converflow-app

Multitenant SaaS platform for AI agents that automate commercial processes (sales, customer service, prospecting, document OCR). Targets compliance with Kit Digital categories **"Gestión de Procesos con IA asociada"** and **"Gestión de Clientes con IA asociada"**.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Web**: Next.js 15 (App Router) + Tailwind + shadcn/ui
- **API**: NestJS + Fastify adapter
- **DB**: Postgres 16 + pgvector + Row Level Security
- **Cache/queues**: Redis 7 + BullMQ
- **LLM**: Anthropic Claude API (with prompt caching)
- **WhatsApp**: Baileys (multi-session, QR onboarding from UI)
- **Auth**: better-auth (separate tenant auth + super admin with TOTP 2FA)

## Layout

```
apps/
├── web/          Next.js — marketing + tenant dashboard + super admin
├── api/          NestJS — REST + webhooks
├── workers/      BullMQ workers — ingest, llm, ocr, embeddings
└── bot-runner/   Baileys multi-session host (stateful)

packages/
├── db/           Prisma schema + RLS policies
├── shared/       Zod schemas, tipos, errores
├── agents/       Agent runtime
├── channels/     Channel adapters (whatsapp, instagram, messenger, webchat)
├── integrations/ External integrations (hubspot, salesforce, google-calendar)
├── ui/           Shared shadcn components
└── config/       Shared tsconfig, eslint, etc.

infra/
├── docker/       compose files + Dockerfiles
├── traefik/      reverse proxy config
└── scripts/      deploy.sh, backup.sh

docs/
├── kit-digital/  Memoria técnica + evidencias
└── architecture/ ADRs
```

## Requirements

- Node 22.12+
- pnpm 9.15+
- Docker + Docker Compose (for local Postgres/Redis)

## Quick start

```bash
# 1. Install
pnpm install

# 2. Copy env
cp .env.example .env
# Generate secrets:
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -hex 32      # → ENCRYPTION_KEY

# 3. Start infra (postgres + redis)
pnpm infra:dev

# 4. Migrate + seed
pnpm db:migrate
pnpm db:seed

# 5. Run everything
pnpm dev
```

Then open:
- Web: http://localhost:3000
- API: http://localhost:4000
- API docs: http://localhost:4000/docs
- Admin: http://localhost:3000/admin/login

## Docs

- [Architecture overview](docs/architecture/README.md)
- [Kit Digital compliance](docs/kit-digital/README.md)
