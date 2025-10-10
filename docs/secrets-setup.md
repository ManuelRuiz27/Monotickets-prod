# GitHub Secrets Setup (Staging)

Use this guide to populate the secrets required by CI/CD and the staging
deployment workflow. Prefer the GitHub CLI (`gh`) when available; otherwise use
the GitHub web UI.

## Required secrets

| Secret name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL consumed by the frontend build. |
| `SUPABASE_KEY` | Supabase service key for server-side calls. |
| `REDIS_URL_STAGING` / `UPSTASH_REDIS_URL` | Redis connection string for staging (Upstash). |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key for asset uploads. |
| `R2_SECRET_ACCESS_KEY` | R2 secret key. |
| `R2_BUCKET` | Target bucket name per environment. |
| `R2_ENDPOINT` | R2 S3-compatible endpoint. |
| `CLOUDFLARE_API_TOKEN` | Token with permissions to manage R2 lifecycle rules. |
| `TESTSPRITE_API_KEY` | Authentication token for TestSprite QA runs. |
| `REGISTRY_URL` | Base URL/namespace for Docker image pushes (e.g. `ghcr.io/org/monotickets`). |
| `REGISTRY_USERNAME` | Registry user or service account. |
| `REGISTRY_PASSWORD` | Registry password or PAT. |
| `SSH_HOST` | Staging host (domain or IP) for deployments. |
| `SSH_USER` | SSH username on the staging host. |
| `SSH_KEY` | Private key (PEM/OpenSSH) used for staging deployments. |

> Optional secrets such as `JWT_SECRET`, `NEXT_PUBLIC_API_BASE`, etc., should be
> defined as repository variables or environment secrets depending on branch
> protections.

## Using GitHub CLI

```bash
# Authenticate once
gh auth login

# Repository scope
REPO="monotickets/monotickets-prod"

# Core application
gh secret set SUPABASE_URL --repo "$REPO" --body "https://example.supabase.co"
gh secret set SUPABASE_KEY --repo "$REPO" --body "supabase-service-key"
gh secret set REDIS_URL_STAGING --repo "$REPO" --body "rediss://:<password>@upstash-url"

# Object storage & Cloudflare
gh secret set R2_ACCESS_KEY_ID --repo "$REPO" --body "cf_r2_key"
gh secret set R2_SECRET_ACCESS_KEY --repo "$REPO" --body "cf_r2_secret"
gh secret set R2_BUCKET --repo "$REPO" --body "monotickets-staging"
gh secret set R2_ENDPOINT --repo "$REPO" --body "https://<account>.r2.cloudflarestorage.com"
gh secret set CLOUDFLARE_API_TOKEN --repo "$REPO" --body "cf_token"

# CI tooling
gh secret set TESTSPRITE_API_KEY --repo "$REPO" --body "testsprite-token"
gh secret set REGISTRY_URL --repo "$REPO" --body "ghcr.io/monotickets"
gh secret set REGISTRY_USERNAME --repo "$REPO" --body "gh-user"
gh secret set REGISTRY_PASSWORD --repo "$REPO" --body "registry-password"

# Deployment host
gh secret set SSH_HOST --repo "$REPO" --body "staging.monotickets.io"
gh secret set SSH_USER --repo "$REPO" --body "deploy"
gh secret set SSH_KEY --repo "$REPO" --body "$(cat ~/.ssh/monotickets_deploy)"
```

Replace placeholder values before running the commands. Secrets can also be
scoped to environments (`--env staging`) if required.

## Using the GitHub UI

1. Navigate to **Settings → Secrets and variables → Actions**.
2. Choose **New repository secret** and provide the name/value pairs listed
   above.
3. For SSH keys, paste the private key content (including header/footer). Ensure
   the corresponding public key is installed on the staging host.
4. Repeat for environment-scoped secrets if branch protections require it.

Keep a secure inventory (1Password, Vault, etc.) with rotation dates and owners
for each secret. Update `docs/docker-env.md` whenever a new secret is introduced.
