# Artifact Storage Strategy

Monotickets stores generated PDFs and media assets in container volumes when
running locally. These mounts simulate Cloudflare R2 so developers can validate
uploads without leaving their machine.

## Volumes

| Volume name    | Path (backend/workers)      | Purpose                 |
| -------------- | --------------------------- | ----------------------- |
| `uploads_local`| `/app/uploads`              | Generic object storage / R2 emulator. |
| `pdfs_local`   | `/app/storage/pdfs`         | Generated tickets, invoices, QR batches. |
| `media_local`  | `/app/storage/media`        | Uploaded images, marketing assets. |

All three volumes are declared in `infra/docker-compose.yml` and attached to the
`backend-api` and `workers` services.

## Local R2 Simulation

To inspect generated files during development:

```bash
docker compose -f infra/docker-compose.yml run --rm backend-api ls -R /app/storage
```

Mount a host directory by extending the compose file if you need direct access:

```yaml
services:
  backend-api:
    volumes:
      - ./tmp/uploads:/app/uploads
      - ./tmp/pdfs:/app/storage/pdfs
      - ./tmp/media:/app/storage/media
```

## Cleaning up

Remove local artifacts without disturbing database data:

```bash
docker compose -f infra/docker-compose.yml down
rm -rf tmp/uploads tmp/pdfs tmp/media
# or prune volumes directly
docker volume rm monotickets-prod_pdfs_local monotickets-prod_media_local
```

> **Tip:** Use `docker volume ls` to find the prefixed volume names created by
> Compose (usually `<project>_<volume>`).
