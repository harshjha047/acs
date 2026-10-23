#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
env_get() { sed -n "s/^$1=//p" .env | tail -1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
for k in MONGO_USER MONGO_PASS BACKUP_DIR BACKUP_KEEP_DAYS BACKUP_RSYNC_TARGET; do
  [ -n "${!k:-}" ] || export "$k=$(env_get "$k")"
done

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
