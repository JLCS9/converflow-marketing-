# =====================================================================
# Dockerfile for apps/web (Next.js 15 standalone)
# =====================================================================
FROM node:22.12-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.15.0 --activate

WORKDIR /repo
COPY . .

RUN pnpm install --frozen-lockfile \
    && pnpm --filter @converflow/shared build \
    && pnpm --filter @converflow/web build

WORKDIR /repo/apps/web
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# Next.js standalone output bundles everything it needs into .next/standalone
CMD ["node", ".next/standalone/apps/web/server.js"]
