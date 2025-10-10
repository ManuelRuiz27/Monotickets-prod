# DevOps Change Log

## [Unreleased]

- Added structured logging with optional JSON format and Prometheus histogram
  metrics (`backend/src/server.js`, `backend/src/logging.js`).
- Documented secrets inventory and setup instructions (`docs/secrets-setup.md`,
  `.env.example`, `docs/docker-env.md`).
- Established backup & lifecycle strategy for PostgreSQL, Redis, and R2
  (`docs/backups-and-lifecycle.md`, `infra/scripts/backup_db.sh`,
  `infra/scripts/restore_db.sh`, `infra/scripts/r2_lifecycle_policies.md`).
- Introduced monitoring stubs and observability guidance (`docs/observability.md`,
  `infra/monitoring/*`).
- Created load testing and scaling utilities (`infra/scripts/scale.sh`,
  `docs/load-tests.md`).
- Implemented CI/CD pipeline updates for image builds and staging deploys
  (`.github/workflows/build-and-push.yml`, `.github/workflows/deploy-staging.yml`,
  `docs/cicd.md`).
