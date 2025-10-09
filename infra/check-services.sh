#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://backend:3000/health}"
FRONTEND_URL="${FRONTEND_URL:-http://frontend:3001/health}"
RETRIES=3
TIMEOUT=5

declare -i EXIT_CODE=0

check() {
  local name="$1"
  local url="$2"
  local http_code

  http_code=$(curl -sS -o /tmp/health-check.$$ --write-out "%{http_code}" --retry "${RETRIES}" --retry-delay 1 --retry-all-errors --max-time "${TIMEOUT}" "${url}" || true)
  if [[ "${http_code}" =~ ^2 ]]; then
    echo "✅ ${name} OK (${http_code})"
  else
    echo "❌ Servicio caído: ${name} (${url}) - código: ${http_code:-N/A}" >&2
    EXIT_CODE=1
  fi
  rm -f /tmp/health-check.$$
}

check "Backend" "${BACKEND_URL}"
check "Frontend" "${FRONTEND_URL}"

exit ${EXIT_CODE}
