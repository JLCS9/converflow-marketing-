# =====================================================================
# Dockerfile for apps/workers (BullMQ workers)
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
    && pnpm --filter @converflow/db generate \
    && pnpm --filter @converflow/shared build \
    && pnpm --filter @converflow/db build \
    && pnpm --filter @converflow/workers build

WORKDIR /repo/apps/workers
ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "dist/index.js"]
