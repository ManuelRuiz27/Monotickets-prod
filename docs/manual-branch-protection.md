# Manual Branch Protection & Remote Bootstrap

GitHub CLI (`gh`) is not available in the current environment. Use the following sequence to create the required branches and configure protection directly via the GitHub REST API or UI.

## 1. Create and Push Bootstrap Branches

```bash
# Starting from an up-to-date local clone
for branch in develop backend/bootstrap frontend/bootstrap infra/bootstrap qa/bootstrap; do
  git checkout -B "$branch"
  git push origin "$branch"
done

# Return to your working branch (e.g., develop)
git checkout develop
```

## 2. Configure Branch Protection (REST API)

Replace `<OWNER>` and `<REPO>` with the repository coordinates. Generate a classic PAT with `repo` scope and store it in `GITHUB_TOKEN`.

```bash
export GITHUB_TOKEN=<your_personal_access_token>
API="https://api.github.com/repos/<OWNER>/<REPO>"

for branch in main develop; do
  curl -X PUT "$API/branches/$branch/protection" \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -d '{
      "required_status_checks": {
        "strict": true,
        "checks": [
          {"context": "Lint"},
          {"context": "Unit Tests"},
          {"context": "TestSprite QA"}
        ]
      },
      "enforce_admins": true,
      "required_pull_request_reviews": {
        "required_approving_review_count": 2,
        "dismiss_stale_reviews": true
      },
      "restrictions": null
    }'
done
```

This enables:

- Required pull requests with two approvals.
- Dismissal of stale reviews on updates.
- Required status checks (`Lint`, `Unit Tests`, `TestSprite QA`).
- Strict enforcement for admins.

## 3. Alternative UI Steps

1. Open the repository on GitHub → **Settings** → **Branches**.
2. Under **Branch protection rules**, click **Add rule**.
3. Set **Branch name pattern** to `main` (repeat for `develop`).
4. Enable:
   - **Require a pull request before merging** (set approvals to 2 and dismiss stale approvals).
   - **Require status checks to pass before merging** and add `Lint`, `Unit Tests`, `TestSprite QA`.
   - **Include administrators**.
   - **Restrict who can push to matching branches** (optional, set to admin team).
5. Save the rule and repeat for `develop`.

Following these steps ensures the branch model described in `docs/git-structure.md` is enforced even without the GitHub CLI.
