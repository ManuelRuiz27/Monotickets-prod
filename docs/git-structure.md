# Git Branching Strategy

Monotickets uses a layered branching model to balance rapid iteration with reliable releases. This document captures the authoritative workflow for creating, reviewing, and releasing changes.

## Branch Hierarchy

- **main**: production-ready branch. Protected; only updated via pull requests from `develop` after QA approval.
- **develop**: integration branch for completed features that are ready for end-to-end validation.
- **backend/*, frontend/*, infra/*:** feature branches created from `develop` for work scoped to each area (e.g., `backend/auth-login`).
- **qa/*:** stabilization branches used by QA to validate staging deployments prior to promoting to `main`.

## Permissions & Protections

- Direct pushes to `main` and `develop` are restricted to repository administrators executing emergency fixes.
- Pull requests into `main` and `develop` must:
  - Have **at least two approving reviews**.
  - Dismiss stale reviews when the PR is updated.
  - Pass the required status checks: `Lint`, `Unit Tests`, and `TestSprite QA`.

> ℹ️ Branch protection can be configured with the GitHub REST API. See [`docs/manual-branch-protection.md`](manual-branch-protection.md) for the exact commands when CLI access is unavailable.

## Pull Request Policy

1. Developers branch off `develop` using the `backend/*`, `frontend/*`, or `infra/*` prefixes as appropriate.
2. Feature work is merged back into `develop` via pull request once the required checks and reviews pass.
3. QA creates `qa/*` branches from `develop` to validate release candidates in staging.
4. After QA sign-off, raise a PR from `develop` into `main`. Deployment to production happens only after this PR is approved by QA and platform leads.

## CI Requirements

All pull requests targeting `develop` or `main` must succeed on:

- **Lint** – static analysis and formatting.
- **Unit Tests** – automated unit and integration tests.
- **TestSprite QA** – end-to-end smoke coverage across API and web experiences.

These checks must report success before a merge is permitted.

## Merge Strategy

- Feature branches (`backend/*`, `frontend/*`, `infra/*`) → `develop` via squash or merge commits after successful CI and reviews.
- `develop` → `qa/*` (created by QA) for release validation.
- `qa/*` → `develop` (optional) if hot fixes are required during QA.
- `develop` → `main` only after QA approval and green CI.

## Release Management

- Releases follow **Semantic Versioning (MAJOR.MINOR.PATCH)**.
- Tags are created on `main` after a successful deploy (e.g., `v1.2.0`).
- Release notes summarize key changes, breaking updates, and operational considerations.
- Hotfixes branch from `main` (e.g., `hotfix/issue-123`), then merge back into both `main` and `develop` via PRs.

## Branch Creation Checklist

1. Sync the latest `develop`.
2. Create a feature branch with the proper prefix (`backend/`, `frontend/`, or `infra/`).
3. Implement changes, ensuring commits are small and atomic.
4. Open a PR targeting `develop`, request reviewers, and ensure CI passes.
5. For QA, branch from `develop` as `qa/<release-name>` and validate in staging.

Following this process keeps `main` deployable, while allowing teams to iterate rapidly and coordinate across backend, frontend, infrastructure, and QA efforts.
