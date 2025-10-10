# Docker Environment Variables

This guide documents the environment configuration required to run the Monotickets stack locally via `infra/docker-compose.yml`.

## Core Application

| Variable | Description | Default |
| --- | --- | --- |
| `APP_ENV` | Execution environment label used by logs and health checks. | `development` |
| `PORT` | Port exposed by the backend API container. | `8080` |
| `JWT_SECRET` | Symmetric secret for signing access tokens. Replace per environment. | `change_me` |
| `STAFF_TOKEN_TTL_HOURS` | Staff session lifetime before re-authentication is required. | `24` |
| `STARTUP_RETRIES` | Number of attempts the backend makes when waiting for Postgres/Redis. | `10` |

## Database & Persistence

| Variable | Description | Default |
| --- | --- | --- |
| `DB_HOST` | Hostname of the PostgreSQL service. | `database` |
| `DB_PORT` | PostgreSQL port. | `5432` |
| `DB_USER` | Database user for application connections. | `postgres` |
| `DB_PASSWORD` | Database password. Replace outside local development. | `postgres` |
| `DB_NAME` | Primary database name. | `monotickets` |

The database container persists data in the `pg_data` volume. Future table partitioning for log retention (90–180 days) will be configured via migrations.

## Redis & Workers

| Variable | Description | Default |
| --- | --- | --- |
| `REDIS_URL` | Connection string for Redis (BullMQ queues locally). | `redis://redis:6379` |
| `WORKER_POLL_INTERVAL_MS` | Interval between worker heartbeat checks. | `5000` |

Uploads generated locally (PDF/media) are mounted through the `uploads_local` volume, simulating Cloudflare R2 during development.

## Object Storage (R2 Simulation)

| Variable | Description |
| --- | --- |
| `R2_ACCESS_KEY_ID` | Placeholder access key for the simulated R2 bucket. Store real values in GitHub Secrets/infra vaults. |
| `R2_SECRET_ACCESS_KEY` | Placeholder secret key. |
| `R2_BUCKET` | Bucket name used by backend and workers. |
| `R2_ENDPOINT` | Endpoint for the local R2 emulator (`https://r2.local.simulated`). |

To map the uploads directory when running locally, create `docker-compose.override.yml` with a bind mount pointing to a host path, or update `uploads_local` volume to point to a specific directory.

## Third-Party Integrations

| Variable | Description |
| --- | --- |
| `WA_360DIALOG_API_KEY` | WhatsApp (360dialog) API key. Use GitHub Secrets for CI/CD. |
| `RESEND_API_KEY` | Resend email API key. |

## Frontend

| Variable | Description | Default |
| --- | --- | --- |
| `FRONTEND_PORT` | Port served by the frontend container. | `3000` |
| `NEXT_PUBLIC_API_BASE` | Base URL exposed to the web client for API calls. | `http://localhost:8080` |

Override browser-facing values using `.env.local` (for Next.js in future phases) or environment-specific compose overrides.

## Test Automation

| Variable | Description | Default |
| --- | --- | --- |
| `E2E_EVENT_ID` | Identificador de evento usado en las comprobaciones HTTP del runner E2E. | `demo-event` |
| `E2E_SAMPLE_CODE` | Código de ejemplo que se envía al endpoint `/scan/validate`. | `MONO-123-ABC` |
| `TEST_TARGET_API` | URL que consume el runner E2E para validar el backend. | `http://backend-api:8080` |
| `TEST_TARGET_WEB` | URL que consume el runner E2E para validar el frontend. | `http://frontend:3000` |

## Overriding per Environment

1. Copy `.env.example` to `.env` for local development.
2. For personal overrides, create `.env.local` or `.env.development.local` (ignored by git) and adjust values.
3. In containerized environments, use `docker-compose.override.yml` to inject per-service overrides, for example to bind `uploads_local` to a host folder:

   ```yaml
   services:
     backend-api:
       volumes:
         - ./local-uploads:/app/uploads
   ```

4. In CI, define secrets/environment variables within GitHub Actions (por ejemplo `JWT_SECRET`, claves de 360dialog, Resend o los valores del runner E2E).

Keeping secrets out of the repository ensures consistent local experience without exposing credentials.
