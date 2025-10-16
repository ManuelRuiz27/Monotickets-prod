# Observability Guide

This guide documents the initial observability surface for Monotickets. It
covers structured logs, metrics, dashboards, and alert recommendations.

## Structured logging

- Set `LOG_FORMAT=json` in `.env` (or the templates under `env/`) to switch
  backend and worker logs to JSON. When omitted, logs stay in a concise text
  format for developer ergonomics.
- `CORRELATION_HEADER` defaults to `X-Request-Id`. Incoming requests that set
  this header keep the value across responses, logs, and downstream queue jobs.
- Each log entry includes:
  - `ts`: ISO 8601 timestamp (UTC).
  - `level`: log severity (`info`, `warn`, `error`, `fatal`).
  - `service`: emitter (`backend-api`, `workers`, etc.).
  - `req_id` / `request_id`: request correlation ID (mirrors `x-request-id`).
  - `path`, `status`, `latency_ms`: populated for HTTP handlers.
  - `event_id`: included for `/scan/validate` traffic when available.
- Logs default to plain text when `LOG_FORMAT` is not set to `json` to keep
  developer ergonomics.
- Loki pipelines (see `infra/monitoring/loki.example.yml`) parse JSON payloads to
  expose keys as labels (`{service="backend-api"}`) for querying.
- Force correlation IDs in ad-hoc calls with:

  ```bash
  curl -H "x-request-id: demo-123" http://localhost:8080/events/demo-event/guests
  ```

  The same `demo-123` identifier will appear in logs for downstream worker jobs.

## Metrics

- The backend exposes Prometheus-compatible metrics at `GET /metrics`.
- Histogram name: `http_request_duration_ms` with `_bucket`, `_sum`, `_count`
  series. Buckets follow `[5,10,25,50,100,250,500,1000,2500,5000,+Inf]` ms and
  include the labels `method`, `route`, `status`.
- Counter: `http_requests_total{method,route,status}` surfaces total processed
  requests and enables error-rate ratios.
- Queue backlog gauge: `queue_backlog{queue}` reports waiting + delayed jobs for
  each queue observed by the backend.
- Queue failure counter: `jobs_failed_total{queue}` increases whenever queue
  processors emit `failed` or `dead-letter` events.
- Suggested Prometheus scrape configuration lives in
  `infra/monitoring/prometheus.example.yml`. Update the targets if the compose
  project name changes.
- Workers currently only emit logs; instrument queue length gauges in future
  iterations if BullMQ is introduced.

Key queries:

- `histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket{route="/scan/validate"}[5m])) by (le))`
  → p95 latency for QR validation.
- `histogram_quantile(0.99, sum(rate(http_request_duration_ms_bucket{route=~"/events/.+"}[5m])) by (le, route))`
  → p99 latency for events APIs.
- `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`
  → aggregate HTTP error rate.
- `queue_backlog{queue="deliveryFailed"}` → inspect dead-letter queue size.
- `jobs_failed_total{queue}` → monitor cumulative failures per queue.

### Scraping instructions

1. Copy `infra/monitoring/prometheus.example.yml` to `infra/monitoring/prometheus.yml`.
2. Update the `targets` array with the reachable hostnames (e.g. `backend-api:8080`).
3. Run Prometheus locally:
   ```bash
   docker run --rm -it -v $(pwd)/infra/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml \
     -p 9090:9090 prom/prometheus
   ```
4. Navigate to `http://localhost:9090` and query
   `histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))`.

### Grafana dashboards

- `infra/monitoring/grafana-dashboards/latency-api.json` is a placeholder. Import
  it into Grafana and adjust the datasource to `Prometheus`.
- Recommended panels:
  - p95 latency per endpoint.
  - Request rate vs error rate.
  - Table of slowest endpoints (top N).

## Alerting recommendations

When integrating Alertmanager or equivalent, use the following baseline rules:

```yaml
# p95 latency above 300 ms for 5 minutes
a- latency_high:
    expr: histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route)) > 0.3
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Backend p95 latency high"
      description: "p95 latency {{ $value }}s for {{ $labels.route }}"

# Error rate > 2% across all endpoints
a- error_rate_high:
    expr: sum(rate(http_requests_total{status=~"5.."}[10m])) / sum(rate(http_requests_total[10m])) > 0.02
    for: 10m
    labels:
      severity: critical
    annotations:
      summary: "HTTP 5xx rate above 2%"
```

> Replace `a-` with your alert group naming convention.

## Log aggregation (Loki stub)

- Copy `infra/monitoring/loki.example.yml` to `infra/monitoring/loki.yml` when
  ready. It includes a pipeline stage to parse JSON logs via `docker` driver.
- Deploy Grafana Loki locally together with Promtail using Docker Compose
  override files. Sample command:
  ```bash
  docker compose -f infra/docker-compose.yml -f infra/monitoring/docker-compose.override.yml up -d loki promtail
  ```
  (Create the override file before running the command.)

## Maintenance tasks

- Rotate `LOG_FORMAT=json` on staging before load tests to capture structured
  output.
- Archive Prometheus data before upgrades by snapshotting the TSDB directory.
- Document any new metrics or dashboards in this file and update
  `docs/load-tests.md` with guidance for QA teams.
