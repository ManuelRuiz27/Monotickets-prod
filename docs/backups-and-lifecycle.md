# Backups & Lifecycle Strategy

This document establishes the baseline policies for data protection across
Monotickets environments. All backups must be validated monthly and monitored in
Grafana once the observability stack is provisioned.

## Cloudflare R2 Lifecycle

| Phase | Days | Storage class | Notes |
| --- | --- | --- | --- |
| Standard | 0–30 | Standard | Default tier for newly created objects. |
| Infrequent | 31–180 | InfrequentAccess | Reduces cost for rarely accessed assets (receipts, QR exports). |
| Archive | 181–540 | Archive | Long-term retention; restore requires asynchronous retrieval. |
| Expiration | ≥ 540 | Delete | Objects older than 18 months are purged unless legal hold applies. |

Guidelines:

- Parameterise thresholds via environment variables when automating: e.g.
  `R2_TRANSITION_STANDARD_DAYS=30`, `R2_EXPIRATION_DAYS=540`.
- Apply lifecycle policies per bucket using the JSON template in
  `infra/scripts/r2_lifecycle_policies.md`.
- Record policy changes in the environment runbook and ticket them through the
  change-management queue.

## PostgreSQL Backups

- **Daily logical dump:** `pg_dump --format=custom` stored in `${BACKUP_DIR}`
  (default `./backups`). Trigger via cron at 02:15 UTC on staging/production.
- **Weekly base backup (optional when WAL archiving available):** run on Sundays
  to capture a cold snapshot prior to maintenance windows.
- **Retention:** keep 30 days for staging, 90 days for production. Configure via
  `BACKUP_RETENTION_DAYS` when running `infra/scripts/backup_db.sh`.

Example cron entry on the database host:

```
15 2 * * * PGPASSWORD="$POSTGRES_PASSWORD" /opt/monotickets/infra/scripts/backup_db.sh >> /var/log/monotickets/backup.log 2>&1
```

Restore procedure:

1. Launch a disposable container or VM (`docker run --rm -it postgres:16-alpine`).
2. Copy the `.dump` file into the container and execute
   `infra/scripts/restore_db.sh --file /backup/YYYY.dump --target-db monotickets_restore`.
3. Validate schema counts and critical tables (`SELECT COUNT(*) FROM events;`).
4. Promote the restored database if validation passes; otherwise discard.

## Redis Strategy

### Local development (Redis OSS)

- Enable both RDB and AOF snapshots every 6 hours using the default
  configuration in `infra/docker-compose.yml`.
- Developers can trigger an immediate snapshot:
  `docker exec monotickets_redis redis-cli save`.
- Store optional RDB exports under `./redis-backups/` for manual testing.

### Staging (Upstash)

- Upstash provides automatic daily snapshots; ensure the plan includes at least
  7 days of retention.
- Export data before destructive operations via the Upstash console (`Export` →
  S3) or REST API (`/export`).
- Document the snapshot ID associated with each deployment in the release issue.

## Disaster Recovery Drills

Perform the following checklist monthly (or after major schema changes):

1. **Database restore test**
   - Run `infra/scripts/backup_db.sh --dry-run` to confirm credentials.
   - Restore the latest staging backup into a temporary container using
     `infra/scripts/restore_db.sh --file <dump> --target-db monotickets_dr_test`.
   - Run smoke queries (counts of attendees, recent transactions).
2. **R2 asset verification**
   - Download a sample batch of objects (`aws s3 sync s3://$R2_BUCKET/sample ./tmp`)
     and verify file integrity hashes.
   - Validate lifecycle transitions with `aws s3api get-bucket-lifecycle-configuration`.
3. **Redis snapshot**
   - For local: simulate failure by stopping Redis, removing data, and restoring
     from the latest snapshot (`redis-check-rdb` + `redis-server --dir ...`).
   - For Upstash: trigger a point-in-time restore in a sandbox database and
     validate queue lengths.
4. **Documentation**
   - Record outcomes, duration, and blockers in the DR log within Confluence or
     `docs/CHANGELOG.md` when applicable.

## Testing Restores

- Integrate the restore scripts into CI nightly (dry-run mode) once runner
  permissions are available.
- Ensure TestSprite scenarios include a smoke test after restoring to staging,
  validating login, scan, and asset download endpoints.
