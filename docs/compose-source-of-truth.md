# Docker Compose Source of Truth

The file `infra/docker-compose.yml` is now the reference orchestration for
Monotickets in both development and staging environments. All compose overrides
should extend this definition instead of recreating services elsewhere.

## Profiles

- `dev`: enables local-first services such as `pwa` and `dashboard` for
  interactive development.
- `prod`: enables the same `pwa` and `dashboard` services but without forcing
  additional overrides, allowing CI/CD or staging runs to opt-in via
  `COMPOSE_PROFILES=prod`.

Activate a profile by exporting `COMPOSE_PROFILES` or passing `--profile`:

```bash
COMPOSE_PROFILES=dev docker compose -f infra/docker-compose.yml up -d
```

## Startup order

1. `database` and `redis` boot first and expose healthchecks.
2. `backend-api` waits for the data stores to become healthy before starting.
3. `workers` wait for the backend and Redis.
4. `pwa` and `dashboard` wait for the backend as well as the data stores.

The dependency graph is captured with `depends_on` entries using health
conditions so that application containers only start after their prerequisites
report ready.

## Healthchecks

| Service       | Command/URL                               | Expectation |
| ------------- | ----------------------------------------- | ----------- |
| `database`    | `pg_isready -U ${DB_USER:-postgres}`      | exits `0`   |
| `redis`       | `redis-cli ping`                          | returns `PONG` |
| `backend-api` | `GET http://localhost:8080/health`        | status `200` |
| `pwa`         | `GET http://localhost:${PWA_PORT:-3000}/` | status `200` |
| `dashboard`   | `GET http://localhost:${DASHBOARD_PORT:-3100}/` | status `200` |

Verify health with:

```bash
docker compose -f infra/docker-compose.yml ps
```

Compose will mark the services as `healthy` (or `starting/ unhealthy`) according
to the defined checks. Use `docker compose logs -f <service>` when debugging
start-up issues.
