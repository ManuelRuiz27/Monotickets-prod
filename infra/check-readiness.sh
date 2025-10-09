#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://backend:3000/health}"
FRONTEND_URL="${FRONTEND_URL:-http://frontend:3001/health}"
TIMEOUT_SECONDS=60
INTERVAL_SECONDS=3

declare -i ELAPSED=0

wait_for() {
  local name="$1"
  local url="$2"
  local elapsed=0

  while (( elapsed < TIMEOUT_SECONDS )); do
    if curl -fsS --max-time 5 "${url}" > /dev/null; then
      echo "✅ ${name} listo (${url})"
      return 0
    fi
    sleep "${INTERVAL_SECONDS}"
    elapsed=$((elapsed + INTERVAL_SECONDS))
  done

  echo "❌ Servicio sin estar listo tras ${TIMEOUT_SECONDS}s: ${name} (${url})" >&2
  return 1
}

wait_for "Backend" "${BACKEND_URL}" &
PID_BACKEND=$!
wait_for "Frontend" "${FRONTEND_URL}" &
PID_FRONTEND=$!

wait ${PID_BACKEND}
BACKEND_STATUS=$?
wait ${PID_FRONTEND}
FRONTEND_STATUS=$?

if [[ ${BACKEND_STATUS} -ne 0 || ${FRONTEND_STATUS} -ne 0 ]]; then
  exit 1
fi

exit 0
