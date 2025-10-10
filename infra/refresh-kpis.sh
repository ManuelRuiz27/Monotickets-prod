#!/usr/bin/env bash
set -euo pipefail

DB_HOST=${DB_HOST:-database}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-postgres}

psql_cmd=(psql "host=${DB_HOST}" "port=${DB_PORT}" "dbname=${DB_NAME}" "user=${DB_USER}" -v ON_ERROR_STOP=1)

views=(
  mv_kpi_confirm_rate
  mv_kpi_time_to_confirm
  mv_kpi_wa_sessions_ratio
  mv_kpi_show_up_rate
  mv_kpi_landing_visits
)

echo "Refreshing materialized views..."
for view in "${views[@]}"; do
  echo " -> ${view}"
  "${psql_cmd[@]}" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY ${view};" || \
    "${psql_cmd[@]}" -c "REFRESH MATERIALIZED VIEW ${view};"
  echo "${view} refreshed"
  echo
  sleep 1

done

echo "Done."
