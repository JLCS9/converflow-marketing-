# =====================================================================
# Dockerfile for apps/bot-runner (Baileys long-lived sessions)
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
    && pnpm --filter @converflow/bot-runner build

WORKDIR /repo/apps/bot-runner
ENV NODE_ENV=production
ENV BOT_SESSIONS_DIR=/var/lib/converflow/bot-sessions

VOLUME ["/var/lib/converflow/bot-sessions"]
EXPOSE 4100

CMD ["node", "--enable-source-maps", "dist/index.js"]
