#!/usr/bin/env bash
# Quick smoke test of the local dev stack.
# Run after `pnpm infra:dev`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`.
set -euo pipefail

WEB="${WEB:-http://localhost:3000}"
API="${API:-http://localhost:4000}"

echo "→ checking API health"
curl -fsS "$API/health" | tee /tmp/cf-health.json
echo
grep -q '"status":"ok"' /tmp/cf-health.json

echo "→ checking web landing"
curl -fsS "$WEB" -o /dev/null

echo "→ checking admin login page renders"
curl -fsS "$WEB/admin/login" -o /dev/null

echo "→ checking tenant login page renders"
curl -fsS "$WEB/login" -o /dev/null

echo "→ checking API docs"
curl -fsS "$API/docs" -o /dev/null

echo "ALL OK"
