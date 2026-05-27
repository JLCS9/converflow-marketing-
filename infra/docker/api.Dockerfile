# =====================================================================
# Dockerfile for apps/api (NestJS + Fastify)
#
# Single-stage by design: pnpm + workspace symlinks don't survive a
# naive multi-stage COPY. We trade image size (~1GB) for correctness
# and ease of iteration. Optimize later with `pnpm deploy`.
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
    && pnpm --filter @converflow/api build

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 4000

# Use tini-style PID 1 via node's --enable-source-maps for stack traces.
CMD ["node", "--enable-source-maps", "dist/main.js"]
