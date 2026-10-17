#!/bin/sh
set -eu

BACKUP_DIR="/var/backups/tikuv-market/postgres"
CONTAINER="tikuv-market-db-1"
RETENTION_MINUTES="43200"

umask 077
mkdir -p "$BACKUP_DIR"

exec 9>"/run/lock/tikuv-market-db-backup.lock"
if ! flock -n 9; then
  echo "A database backup is already running"
  exit 0
fi

if [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]; then
  echo "PostgreSQL container is not running" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL_PATH="$BACKUP_DIR/inventory_sales-$STAMP.dump"
TEMP_PATH="$(mktemp "$BACKUP_DIR/.inventory_sales-$STAMP.XXXXXX.tmp")"
TEMP_NAME="$(basename "$TEMP_PATH")"

cleanup() {
  rm -f -- "$TEMP_PATH"
}
trap cleanup EXIT INT TERM

docker exec "$CONTAINER" sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  >"$TEMP_PATH"

if [ ! -s "$TEMP_PATH" ]; then
  echo "Database backup is empty" >&2
  exit 1
fi

docker run --rm --network none \
  -v "$BACKUP_DIR:/backup:ro" \
  postgres:17-alpine \
  pg_restore --list "/backup/$TEMP_NAME" >/dev/null

mv -- "$TEMP_PATH" "$FINAL_PATH"
trap - EXIT INT TERM
sha256sum "$FINAL_PATH" >"$FINAL_PATH.sha256"
chmod 600 "$FINAL_PATH" "$FINAL_PATH.sha256"

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'inventory_sales-*.dump' -o -name 'inventory_sales-*.dump.sha256' \) \
  -mmin "+$RETENTION_MINUTES" -delete

echo "Database backup completed: $(basename "$FINAL_PATH") ($(stat -c %s "$FINAL_PATH") bytes)"
