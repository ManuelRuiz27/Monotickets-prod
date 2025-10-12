#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SSH_HOST:-}" || -z "${SSH_USER:-}" ]]; then
  echo "[ERROR] SSH_HOST and SSH_USER must be provided" >&2
  exit 1
fi

if [[ -z "${SSH_PRIVATE_KEY_PATH:-}" || ! -f "${SSH_PRIVATE_KEY_PATH}" ]]; then
  echo "[ERROR] SSH_PRIVATE_KEY_PATH must point to the SSH private key" >&2
  exit 1
fi

if [[ -z "${REGISTRY_URL:-}" || -z "${REGISTRY_USERNAME:-}" || -z "${REGISTRY_PASSWORD:-}" ]]; then
  echo "[ERROR] REGISTRY_URL, REGISTRY_USERNAME and REGISTRY_PASSWORD are required" >&2
  exit 1
fi

if [[ -z "${IMAGE_TAG:-}" ]]; then
  echo "[ERROR] IMAGE_TAG must be provided" >&2
  exit 1
fi

REGISTRY_HOST="${REGISTRY_URL%%/*}"
REMOTE_COMPOSE_FILE="${REMOTE_COMPOSE_FILE:-/opt/monotickets/docker-compose.yml}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/opt/monotickets/.env.staging}"
SSH_OPTS="${SSH_OPTS:--o StrictHostKeyChecking=no}"

read -r -d '' REMOTE_SCRIPT <<'SCRIPT'
set -euo pipefail
REGISTRY_HOST="$1"
REGISTRY_URL="$2"
REGISTRY_USERNAME="$3"
REGISTRY_PASSWORD="$4"
IMAGE_TAG="$5"
COMPOSE_FILE="$6"
ENV_FILE="$7"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker CLI not found on remote host" >&2
  exit 1
fi

docker login "$REGISTRY_HOST" --username "$REGISTRY_USERNAME" --password "$REGISTRY_PASSWORD"

docker pull "$REGISTRY_URL/backend-api:$IMAGE_TAG"
docker pull "$REGISTRY_URL/workers:$IMAGE_TAG"
docker pull "$REGISTRY_URL/frontend:$IMAGE_TAG"
# BEGIN devops-ci
docker pull "$REGISTRY_URL/pwa:$IMAGE_TAG" || true
docker pull "$REGISTRY_URL/dashboard:$IMAGE_TAG" || true
# END devops-ci

SERVICES="backend-api workers frontend"
# BEGIN devops-ci
SERVICES="$SERVICES pwa dashboard"
# END devops-ci

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d $SERVICES
SCRIPT

ssh ${SSH_OPTS} -i "$SSH_PRIVATE_KEY_PATH" "$SSH_USER@$SSH_HOST" \
  bash -s -- "$REGISTRY_HOST" "$REGISTRY_URL" "$REGISTRY_USERNAME" "$REGISTRY_PASSWORD" "$IMAGE_TAG" "$REMOTE_COMPOSE_FILE" "$REMOTE_ENV_FILE" <<<"$REMOTE_SCRIPT"
