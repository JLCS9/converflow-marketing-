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
    && pnpm --filter @converflow/web build \
    # Next.js standalone does NOT copy static/ or public/ automatically.
    # Without these, the client-side JS chunks 404 and pages don't hydrate.
    && mkdir -p /repo/apps/web/.next/standalone/apps/web \
    && cp -r /repo/apps/web/.next/static /repo/apps/web/.next/standalone/apps/web/.next/static \
    && (cp -r /repo/apps/web/public /repo/apps/web/.next/standalone/apps/web/public 2>/dev/null || true)

WORKDIR /repo/apps/web
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", ".next/standalone/apps/web/server.js"]
