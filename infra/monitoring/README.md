# Monitoring Stubs

This folder contains sample configuration files to bootstrap a local
Prometheus/Grafana/Loki stack. They are not referenced by default compose files
and must be opt-in.

## Quick start (local only)

1. Copy the examples:
   ```bash
   cp infra/monitoring/prometheus.example.yml infra/monitoring/prometheus.yml
   cp infra/monitoring/loki.example.yml infra/monitoring/loki.yml
   ```
2. Create a `docker-compose.override.yml` with the monitoring services (example):
   ```yaml
   services:
     prometheus:
       image: prom/prometheus:latest
       volumes:
         - ./infra/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
       ports:
         - "9090:9090"
     grafana:
       image: grafana/grafana:latest
       ports:
         - "3001:3000"
       volumes:
         - ./infra/monitoring/grafana-dashboards:/var/lib/grafana/dashboards:ro
     loki:
       image: grafana/loki:2.9.0
       command: ["-config.file=/etc/loki/local-config.yml"]
       volumes:
         - ./infra/monitoring/loki.yml:/etc/loki/local-config.yml:ro
   ```
3. Start monitoring alongside the core stack:
   ```bash
   docker compose -f infra/docker-compose.yml -f docker-compose.override.yml up -d
   ```
4. Import `infra/monitoring/grafana-dashboards/latency-api.json` into Grafana.

## Production considerations

- Deploy monitoring to a dedicated cluster or managed service.
- Secure Prometheus `/metrics` endpoints behind network policies or basic auth.
- Configure retention (`--storage.tsdb.retention.time=30d`) and persistent
  volumes before enabling multi-day scrapes.
- Integrate alerting with PagerDuty or Opsgenie once Alertmanager is available.
