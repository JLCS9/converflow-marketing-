# =====================================================================
# Multi-stage Dockerfile for apps/api
# =====================================================================
FROM node:22.12-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- deps ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @converflow/db generate
RUN pnpm --filter @converflow/api build

# ---- runtime ----
FROM node:22.12-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./
COPY --from=build /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/packages/db/src/generated/client ./node_modules/@converflow/db/src/generated/client
EXPOSE 4000
USER node
CMD ["node", "dist/main.js"]
