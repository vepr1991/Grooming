#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set a NEW empty database URL}"
: "${BACKUP_FILE:?Set BACKUP_FILE}"
# No --clean: refuse to overwrite objects in an existing database.
python3 "$(dirname "$0")/pg_command.py" RESTORE_DATABASE_URL psql -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
python3 "$(dirname "$0")/pg_command.py" RESTORE_DATABASE_URL pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname-from-env "$BACKUP_FILE"
