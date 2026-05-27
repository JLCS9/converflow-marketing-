#!/usr/bin/env bash
# =====================================================================
# Deploy / update converflow-ai on the VPS.
#
# Run ON THE VPS after `git pull`.
#
# Prereqs on the VPS:
#   - Docker + docker compose plugin (already installed)
#   - Repo cloned at /opt/converflow-ai
#   - infra/docker/.env.prod present with chmod 600
#   - Nginx vhost wired (see infra/nginx/converflow-ai.conf)
# =====================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/converflow-ai}"
COMPOSE_FILE="infra/docker/docker-compose.prod.yml"
ENV_FILE="infra/docker/.env.prod"
COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

cd "$REPO_DIR"

echo "→ Pulling latest code"
git pull --ff-only

echo "→ Building images"
$COMPOSE build

echo "→ Bringing up stack"
$COMPOSE up -d --remove-orphans

echo "→ Waiting for Postgres to be healthy"
for i in {1..30}; do
  if $COMPOSE ps postgres --format json | grep -q '"Health":"healthy"'; then
    echo "  Postgres healthy"
    break
  fi
  sleep 2
done

echo "→ Running migrations + RLS + seed (idempotent)"
$COMPOSE exec -T api sh -c "cd /app && npx --yes prisma migrate deploy --schema=/app/node_modules/@converflow/db/prisma/schema.prisma" || true

echo "→ Health checks"
sleep 3
curl -fsS http://127.0.0.1:${API_HOST_PORT:-8091}/health && echo
curl -fsS http://127.0.0.1:${BOT_RUNNER_HOST_PORT:-8092}/health && echo

echo "→ Done."
echo "  Web:   http://127.0.0.1:${WEB_HOST_PORT:-8090}"
echo "  API:   http://127.0.0.1:${API_HOST_PORT:-8091}/health"
echo "  Bot:   http://127.0.0.1:${BOT_RUNNER_HOST_PORT:-8092}/health"
echo
echo "  Public URLs (once nginx + DNS are configured):"
echo "    https://app.converflow.ai"
echo "    https://admin.converflow.ai"
echo "    https://api.converflow.ai/health"
