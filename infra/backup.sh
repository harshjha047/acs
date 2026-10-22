#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a

DIR="${BACKUP_DIR:-/opt/acs/backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
FILE="$DIR/mongo-$(date +%F-%H%M).archive.gz"
mkdir -p "$DIR"

docker compose exec -T mongo mongodump --quiet --archive --gzip \
  -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
find "$DIR" -name 'mongo-*.archive.gz' -mtime +"$KEEP" -delete

if [ -n "${BACKUP_RSYNC_TARGET:-}" ]; then
  rsync -a --delete -e "ssh -o BatchMode=yes" "$DIR/" "$BACKUP_RSYNC_TARGET"
fi
echo "backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
