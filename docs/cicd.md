# CI/CD Pipeline Overview

Monotickets uses GitHub Actions for CI, image builds, and staging deployments.
This document summarises the workflow topology and required secrets.

## Workflows

| Workflow | File | Trigger | Purpose |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | `pull_request` → `develop`, `main` | Runs lint, unit tests, and TestSprite. Produces the `testsprite-report` artifact. |
| Build & Push | `.github/workflows/build-and-push.yml` | `push` to `develop`/`main`; `workflow_run` (CI success) | Builds Docker images (`backend-api`, `workers`, `frontend`) and pushes them to the registry. |
| Deploy Staging | `.github/workflows/deploy-staging.yml` | `workflow_run` (Build & Push success); `workflow_dispatch` | Deploys the latest image tag to the staging host after validating TestSprite status. |

## Image tagging

- Every build pushes `${REGISTRY_URL}/<service>:${GITHUB_SHA}`.
- Commits on `main` also publish the `latest` tag for rapid rollbacks.
- The deploy workflow references `github.event.workflow_run.head_sha` to select
  the image tag.

## Secrets & variables

| Name | Used in | Description |
| --- | --- | --- |
| `TESTSPRITE_API_KEY` | CI | API key for TestSprite smoke tests. |
| `REGISTRY_URL`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD` | Build & Push, Deploy | Registry endpoint and credentials. |
| `SSH_HOST`, `SSH_USER`, `SSH_KEY` | Deploy Staging | SSH details for the staging host. |
| `SUPABASE_URL`, `SUPABASE_KEY`, `REDIS_URL_STAGING`, `R2_*`, `CLOUDFLARE_API_TOKEN` | Deploy (environment variables) | Passed to the staging host for runtime configuration. |

Refer to `docs/secrets-setup.md` for CLI commands to seed these values.

## Manual deploys

Use the **Deploy Staging** workflow → **Run workflow** in GitHub Actions to force
an image rollout (e.g. hotfix). Provide the `image_tag` input to override the
SHA (defaults to latest successful Build & Push run).

## Promotion checklist

1. Ensure the CI workflow is green (TestSprite included).
2. Confirm Build & Push completed for the target commit.
3. Trigger or wait for Deploy Staging. Monitor the logs in GitHub Actions.
4. Validate staging health endpoints:
   ```bash
   curl -sSf https://staging.monotickets.io/health
   ```
5. Update release notes with the deployed image tags and TestSprite report link.
