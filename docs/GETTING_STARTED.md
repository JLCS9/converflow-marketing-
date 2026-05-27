# Getting started

## 0. Requirements

- Node 22.12+
- pnpm 9.15+
- Docker Desktop (for the local Postgres + Redis)
- OR local Homebrew Postgres@15 + Redis if you prefer

## 1. Install

```bash
cd ~/Dev/converflow-app
pnpm install
```

This installs all workspaces and generates the Prisma client.

## 2. Configure

```bash
cp .env.example .env

# Generate two secrets
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
```

Open `.env` and adjust the rest if your local Postgres/Redis aren't on
defaults. The `SUPER_ADMIN_BOOTSTRAP_EMAIL` already points to
`jose@csodigital.tech` from `.env.example`.

## 3. Start infra

```bash
pnpm infra:dev
# postgres:5432, redis:6379
```

## 4. Migrate + seed

```bash
pnpm db:migrate    # creates schema + applies RLS policies
pnpm db:seed       # creates the super admin (prints temp password)
```

Copy the temporary password from the stdout — you'll need it for the
first admin login. Change it and enroll TOTP 2FA immediately afterwards.

## 5. Run everything

```bash
pnpm dev
```

Then open:

- Web: <http://localhost:3000>
- API docs: <http://localhost:4000/docs>
- Admin login: <http://localhost:3000/admin/login>

## Common commands

```bash
pnpm dev                  # all apps in parallel (turborepo)
pnpm --filter @converflow/web dev   # just one app
pnpm db:studio            # browse the database
pnpm db:migrate:reset     # nuke and re-seed (DEV ONLY)
pnpm lint
pnpm typecheck
pnpm test
pnpm build                # build everything for production
```

## Troubleshooting

- **`prisma generate` fails** — make sure Postgres is up (`pnpm infra:dev`) before running migrations.
- **API can't connect to Postgres** — `DATABASE_URL` in `.env` should match the running container (user/password `converflow`/`converflow`).
- **`pnpm dev` says port in use** — check if you have other apps on 3000/4000/4100.
- **Admin login says invalid 2FA** — only if you've enrolled it; otherwise the form skips that field.
