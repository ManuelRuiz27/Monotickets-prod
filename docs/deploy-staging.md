# Deploying to Staging

The staging environment is deployed via GitHub Actions after the Build & Push
workflow completes successfully. This document summarises the automated path and
the manual fallback procedure.

## Automated flow

1. A PR merges into `develop`.
2. CI (`ci.yml`) runs lint, unit, smoke, E2E, and TestSprite.
3. On success, **Build & Push** publishes Docker images tagged with the commit SHA
   for `backend-api`, `workers`, `frontend`, `pwa`, and `dashboard`.
4. **Deploy Staging** (`deploy-staging.yml`) triggers (or can be run manually) and
   executes `infra/scripts/deploy_staging.sh` on the staging host.
5. The script logs into the registry, pulls the required images, and runs
   `docker compose up -d` to refresh the services.

The workflow aborts if any of the CI checks (`Smoke`, `E2E`, `TestSprite QA`) did
not succeed for the target SHA.

## Manual execution

Use the GitHub UI (**Deploy Staging** → **Run workflow**) or run the script
locally with SSH access:

```bash
SSH_HOST=staging.monotickets.io \
SSH_USER=deploy \
SSH_PRIVATE_KEY_PATH=~/.ssh/monotickets_deploy \
REGISTRY_URL=${REGISTRY_URL} \
REGISTRY_USERNAME=${REGISTRY_USERNAME} \
REGISTRY_PASSWORD=${REGISTRY_PASSWORD} \
IMAGE_TAG=$(git rev-parse HEAD) \
./infra/scripts/deploy_staging.sh
```

> Replace the environment variables with the GitHub Secrets described in
> `docs/secrets-setup.md`.

## Post-deploy verification

- `curl -sSf https://staging.monotickets.io/health`
- `curl -sSf https://staging.monotickets.io/dashboard`
- Check `docker compose ps` on the staging host for healthy containers.
- Confirm the Cloudflare R2 simulator volume still contains expected PDFs and
  media (if applicable).

If any step fails, roll back by re-running the workflow with a previous image
SHA or by redeploying `main`.
