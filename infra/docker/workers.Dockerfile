# =====================================================================
# Multi-stage Dockerfile for apps/workers
# =====================================================================
FROM node:22.12-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/workers/package.json apps/workers/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages packages
COPY apps/workers apps/workers
RUN pnpm --filter @converflow/db generate
RUN pnpm --filter @converflow/workers build

FROM node:22.12-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/workers/dist ./dist
COPY --from=build /repo/apps/workers/package.json ./
COPY --from=build /repo/apps/workers/node_modules ./node_modules
COPY --from=build /repo/packages/db/src/generated/client ./node_modules/@converflow/db/src/generated/client
USER node
CMD ["node", "dist/index.js"]
