#!/usr/bin/env bash
# =====================================================================
# Base de datos efímera para los tests de integración (pgvector + RLS).
#
# Uso local:
#   ./infra/scripts/test-db.sh up      # arranca el contenedor y prepara todo
#   ./infra/scripts/test-db.sh down    # lo destruye
#
# Exporta (imprime) las dos URLs que esperan los specs de integración:
#   TEST_DATABASE_URL        → rol converflow_app (SUJETO a RLS)
#   TEST_DATABASE_URL_SUPER  → superusuario (solo seeding/limpieza del test)
#
# En CI el contenedor lo aporta el workflow como service; este script se usa
# solo con `prepare` para el push+rls+ddl+rol.
# =====================================================================
set -euo pipefail

NAME=cfai-test-pg
PORT="${TEST_PG_PORT:-55433}"
PASS=testpass
DB=converflow_test
SUPER_URL="postgresql://postgres:${PASS}@localhost:${PORT}/${DB}"
APP_URL="postgresql://converflow_app:apppass@localhost:${PORT}/${DB}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

prepare() {
  # Schema + políticas + índices + rol, contra la URL de superusuario.
  ( cd "$ROOT/packages/db" \
    && DATABASE_URL="$SUPER_URL" DATABASE_DIRECT_URL="$SUPER_URL" pnpm exec prisma db push --skip-generate --accept-data-loss \
    && DATABASE_URL="$SUPER_URL" DATABASE_DIRECT_URL="$SUPER_URL" pnpm exec prisma db execute --file ./prisma/sql/rls-policies.sql --schema ./prisma/schema.prisma \
    && DATABASE_URL="$SUPER_URL" DATABASE_DIRECT_URL="$SUPER_URL" pnpm exec prisma db execute --file ./prisma/sql/ddl.sql --schema ./prisma/schema.prisma \
    && DATABASE_URL="$SUPER_URL" DATABASE_DIRECT_URL="$SUPER_URL" pnpm exec prisma db execute --file ./prisma/sql/create-app-role.sql --schema ./prisma/schema.prisma )
  # El script del rol referencia la BD de producción por nombre; asegura el
  # CONNECT sobre la de test y fija password del rol de app.
  docker exec "$NAME" psql -U postgres -d "$DB" -c \
    "GRANT CONNECT ON DATABASE ${DB} TO converflow_app; ALTER ROLE converflow_app PASSWORD 'apppass';" >/dev/null 2>&1 \
    || psql "$SUPER_URL" -c "GRANT CONNECT ON DATABASE ${DB} TO converflow_app; ALTER ROLE converflow_app PASSWORD 'apppass';"
  echo "TEST_DATABASE_URL=$APP_URL"
  echo "TEST_DATABASE_URL_SUPER=$SUPER_URL"
}

case "${1:-up}" in
  up)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -p "${PORT}:5432" \
      -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB="$DB" \
      pgvector/pgvector:pg16 >/dev/null
    echo "esperando a postgres…"
    for _ in $(seq 1 30); do
      docker exec "$NAME" pg_isready -U postgres -d "$DB" >/dev/null 2>&1 && break
      sleep 1
    done
    prepare
    ;;
  prepare)
    # CI: el postgres ya existe como service; solo push+rls+ddl+rol.
    SUPER_URL="${TEST_DATABASE_URL_SUPER:?exporta TEST_DATABASE_URL_SUPER}"
    APP_URL="${TEST_DATABASE_URL:?exporta TEST_DATABASE_URL}"
    ( cd "$ROOT/packages/db" \
      && DATABASE_URL="$SUPER_URL" DATABASE_DIRECT_URL="$SUPER_URL" pnpm exec prisma db push --skip-generate --accept-data-loss \
      && DATABASE_URL="$SUPER_URL" DATABASE_DIRECT_URL="$SUPER_URL" pnpm exec prisma db execute --file ./prisma/sql/rls-policies.sql --schema ./prisma/schema.prisma \
      && DATABASE_URL="$SUPER_URL" DATABASE_DIRECT_URL="$SUPER_URL" pnpm exec prisma db execute --file ./prisma/sql/ddl.sql --schema ./prisma/schema.prisma \
      && DATABASE_URL="$SUPER_URL" DATABASE_DIRECT_URL="$SUPER_URL" pnpm exec prisma db execute --file ./prisma/sql/create-app-role.sql --schema ./prisma/schema.prisma )
    psql "$SUPER_URL" -c "GRANT CONNECT ON DATABASE $(basename "${SUPER_URL##*/}" | cut -d'?' -f1) TO converflow_app; ALTER ROLE converflow_app PASSWORD 'apppass';"
    ;;
  down)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    ;;
  *)
    echo "uso: $0 up|prepare|down" >&2; exit 1;;
esac
