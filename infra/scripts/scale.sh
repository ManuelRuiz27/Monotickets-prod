#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scale.sh --service NAME --replicas N [--dry-run]

Scales a service defined in infra/docker-compose.yml by invoking
`docker compose up -d --scale`.

Examples:
  ./infra/scripts/scale.sh --service backend-api --replicas 3
  ./infra/scripts/scale.sh --service workers --replicas 5 --dry-run
USAGE
}

SERVICE=""
REPLICAS=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      SERVICE="$2"
      shift 2
      ;;
    --replicas)
      REPLICAS="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
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

if [[ -z "$SERVICE" || -z "$REPLICAS" ]]; then
  echo "[ERROR] --service and --replicas are required." >&2
  usage
  exit 1
fi

if ! [[ "$REPLICAS" =~ ^[0-9]+$ ]]; then
  echo "[ERROR] --replicas must be a non-negative integer." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[WARN] docker CLI not found. Install Docker to use the auto-scaling helper." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[ERROR] Compose file not found at ${COMPOSE_FILE}." >&2
  exit 1
fi

escaped_service=$(printf '%s\n' "$SERVICE" | sed 's/[-.[\\*^$(){}+?|]/\\&/g')
if ! grep -Eq "^[[:space:]]{2}${escaped_service}:" "$COMPOSE_FILE"; then
  echo "[ERROR] Service '${SERVICE}' not defined in ${COMPOSE_FILE}." >&2
  exit 1
fi

CMD=(docker compose -f "$COMPOSE_FILE" up -d --scale "${SERVICE}=${REPLICAS}")

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] Would execute: ${CMD[*]}" >&2
  exit 0
fi

"${CMD[@]}"
