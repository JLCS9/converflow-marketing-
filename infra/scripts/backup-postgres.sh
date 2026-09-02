#!/usr/bin/env bash
# =====================================================================
# Backup diario de Postgres (prerrequisito F0 del motor de IA: antes de
# construir memoria vectorial cara de reconstruir, hay que poder restaurar).
#
# Ejecutar EN EL VPS. Instalación del cron (una vez):
#   crontab -e
#   30 3 * * * /opt/converflow-ai/infra/scripts/backup-postgres.sh >> /var/log/cfai-backup.log 2>&1
#
# Qué hace:
#   1. pg_dump (formato custom, comprimido) desde el contenedor cfai-postgres.
#   2. Rota: conserva los últimos 14 dumps locales en /opt/converflow-ai/backups.
#   3. Si hay rclone configurado con un remoto `cfai-backups:` (R2/S3/B2…),
#      sube el dump — ESO es lo que saca la copia fuera del VPS.
#      Configuración VERIFICADA para Cloudflare R2 (2026-09; rclone 1.60 del
#      apt de Debian 13 sirve) — escribir /root/.config/rclone/rclone.conf:
#        [cfai-backups]
#        type = s3
#        provider = Cloudflare
#        access_key_id = <R2 API token: Access Key ID>
#        secret_access_key = <R2 API token: Secret>
#        endpoint = https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com
#        no_check_bucket = true
#      OJO: SIN línea `acl = ...` — R2 no implementa ACLs y responde
#      «501 Not Implemented» a cualquier subida que la lleve.
#      Sin rclone, el backup queda solo local (mejor que nada, pero el
#      objetivo de F0 es fuera del VPS).
#
# Restaurar:
#   docker exec -i cfai-postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < backups/<fichero>
# =====================================================================
set -euo pipefail

DIR="${BACKUP_DIR:-/opt/converflow-ai/backups}"
KEEP="${BACKUP_KEEP:-14}"
CONTAINER=cfai-postgres
ENV_FILE="/opt/converflow-ai/infra/docker/.env.prod"

PGUSER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2)
PGDB=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2)
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$DIR/cfai-${PGDB}-${STAMP}.dump"

mkdir -p "$DIR"
docker exec "$CONTAINER" pg_dump -U "$PGUSER" -d "$PGDB" -Fc > "$FILE"
echo "$(date -Is) backup: $FILE ($(du -h "$FILE" | cut -f1))"

# Rotación local
ls -1t "$DIR"/cfai-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

# Copia fuera del VPS (opcional pero objetivo de F0)
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q '^cfai-backups:'; then
  rclone copy "$FILE" cfai-backups:cfai-backups/postgres/ --s3-no-check-bucket
  echo "$(date -Is) subido a cfai-backups:cfai-backups/postgres/"
else
  echo "$(date -Is) AVISO: rclone/cfai-backups no configurado — el backup es solo local"
fi
