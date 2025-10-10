#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: backup_db.sh [--dry-run] [--output-dir DIR]

Creates a compressed pg_dump backup using the connection details defined in the
environment variables DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME.
The default output directory is ./backups relative to the repository root.

Environment hints:
  * Set PGPASSWORD or use a .pgpass file when running from CI.
  * Override BACKUP_RETENTION_DAYS to align with retention policies.
USAGE
}

DRY_RUN=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-${ROOT_DIR}/backups}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
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

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"
BACKUP_TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${OUTPUT_DIR}/${DB_NAME}-${BACKUP_TS}.dump"

mkdir -p "$OUTPUT_DIR"

BACKUP_CMD=(pg_dump "--host=${DB_HOST}" "--port=${DB_PORT}" "--username=${DB_USER}" \
  "--format=custom" "--file=${BACKUP_FILE}" "${DB_NAME}")

if [[ "${PGPASSWORD:-}" == "" ]]; then
  echo "[INFO] No PGPASSWORD provided. pg_dump will prompt if authentication is required." >&2
fi

if [[ "$DRY_RUN" == "true" ]]; then
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "[WARN] pg_dump not found. Install the PostgreSQL client tools (psql) before running backups." >&2
    echo "       Example (Debian/Ubuntu): apt-get update && apt-get install postgresql-client" >&2
  fi
  echo "[DRY-RUN] Would execute: ${BACKUP_CMD[*]}" >&2
  echo "[DRY-RUN] Backup would be stored at: ${BACKUP_FILE}" >&2
  exit 0
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[ERROR] pg_dump not found. Install the PostgreSQL client tools (psql) before running backups." >&2
  echo "       Example (Debian/Ubuntu): apt-get update && apt-get install postgresql-client" >&2
  exit 1
fi

"${BACKUP_CMD[@]}"

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
find "$OUTPUT_DIR" -type f -name "${DB_NAME}-*.dump" -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true

echo "[OK] Backup stored at ${BACKUP_FILE}" >&2
