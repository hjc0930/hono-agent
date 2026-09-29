# Continuous Integration and Develop Branch Rules

## Branch policy

The `develop` branch is the integration branch and accepts ordinary direct
pushes, force pushes, and pull requests. An active GitHub branch ruleset targets only
`refs/heads/develop` and prevents deletion, with no
bypass actors. It does not require pull requests, approvals, status checks, or
up-to-date branches. CI failures provide feedback but do not block merging or
undo commits already pushed. Existing rules for `main` remain unchanged.

## Workflow

`.github/workflows/develop-ci.yml` (display name: `Develop CI`) runs on pushes to `develop` and pull requests targeting
`develop`. It also declares `workflow_dispatch`; GitHub exposes manual dispatch
after this workflow exists on the repository's default branch (`main`). Adding
the workflow to `main` is a separate merge, not a default-branch change.

The workflow uses one `quality` job on Ubuntu 24.04, with Node.js 24.21.0 and pnpm
12.6.0 matching the development environment at introduction. Action references
use major-version tags (`@v4`) for readability. The job has a ten-minute timeout and read-only
repository contents permission. Checkout does not persist credentials.

Cache the pnpm store using `pnpm-lock.yaml` and install with
`pnpm install --frozen-lockfile`. Run these checks in order, stopping on failure:

1. `pnpm run format:check`
2. `pnpm run lint`
3. `pnpm run typecheck`
4. `pnpm test`
5. `pnpm run test:e2e`
6. `pnpm run build`

New runs cancel older runs for the same event and PR or branch. Do not filter
paths: documentation and workflow changes must also be checked. Tests use the
existing Vitest setup and test-only configuration; no local `.env`, real secrets,
external database, deployment, migration, or seed operation is required.

## Verification

- Run the existing quality commands before publishing the workflow.
- Verify the first GitHub Actions push run completes all six checks successfully.
- Read back the remote ruleset and confirm its exact branch target, active
  enforcement, empty bypass list, and only the deletion rule.
- Confirm a normal push to `develop` is accepted after the ruleset is enabled.
- Subsequent PRs targeting `develop` must show CI feedback without mandatory
  approval or required-status-check restrictions.
