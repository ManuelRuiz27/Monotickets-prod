#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: restore_db.sh --file PATH [--dry-run] [--target-db NAME]

Restores a PostgreSQL backup created with backup_db.sh. The script detects
whether the input is a custom-format dump (*.dump) or a plain SQL file.

Environment hints:
  * Provide DB_HOST, DB_PORT, DB_USER and DB_NAME (or use --target-db) to
    choose the restoration target.
  * Supply PGPASSWORD or configure .pgpass for non-interactive authentication.
USAGE
}

DRY_RUN=false
BACKUP_FILE=""
TARGET_DB="${DB_NAME:-postgres}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      BACKUP_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --target-db)
      TARGET_DB="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$BACKUP_FILE" ]]; then
  echo "[ERROR] --file argument is required." >&2
  usage
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "[ERROR] Backup file $BACKUP_FILE not found." >&2
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] Would restore ${BACKUP_FILE} into database ${TARGET_DB} on ${DB_HOST}:${DB_PORT} as ${DB_USER}" >&2
  exit 0
fi

if [[ "$BACKUP_FILE" == *.dump ]]; then
  if ! command -v pg_restore >/dev/null 2>&1; then
    echo "[WARN] pg_restore not found. Install the PostgreSQL client tools before running restores." >&2
    exit 1
  fi
  pg_restore \
    "--host=${DB_HOST}" \
    "--port=${DB_PORT}" \
    "--username=${DB_USER}" \
    --clean --if-exists --no-owner \
    "--dbname=${TARGET_DB}" \
    "$BACKUP_FILE"
else
  if ! command -v psql >/dev/null 2>&1; then
    echo "[WARN] psql not found. Install the PostgreSQL client tools before running restores." >&2
    exit 1
  fi
  psql \
    "--host=${DB_HOST}" \
    "--port=${DB_PORT}" \
    "--username=${DB_USER}" \
    "--dbname=${TARGET_DB}" \
    --file "$BACKUP_FILE"
fi

echo "[OK] Restore completed for ${TARGET_DB}" >&2
