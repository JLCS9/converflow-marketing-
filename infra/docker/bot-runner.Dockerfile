# =====================================================================
# Multi-stage Dockerfile for apps/bot-runner (Baileys host)
# =====================================================================
FROM node:22.12-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/bot-runner/package.json apps/bot-runner/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages packages
COPY apps/bot-runner apps/bot-runner
RUN pnpm --filter @converflow/db generate
RUN pnpm --filter @converflow/bot-runner build

FROM node:22.12-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV BOT_SESSIONS_DIR=/var/lib/converflow/bot-sessions
COPY --from=build /repo/apps/bot-runner/dist ./dist
COPY --from=build /repo/apps/bot-runner/package.json ./
COPY --from=build /repo/apps/bot-runner/node_modules ./node_modules
COPY --from=build /repo/packages/db/src/generated/client ./node_modules/@converflow/db/src/generated/client
EXPOSE 4100
USER node
CMD ["node", "dist/index.js"]
