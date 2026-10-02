#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${BACKUP_DIR:?Set BACKUP_DIR outside the repository}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077
backup_file="$BACKUP_DIR/grooming-$(date -u +%Y%m%dT%H%M%SZ).dump"
python3 "$(dirname "$0")/pg_command.py" DATABASE_URL pg_dump --schema=crm --format=custom --no-owner --no-acl --file="$backup_file"
printf '%s\n' "$backup_file"
