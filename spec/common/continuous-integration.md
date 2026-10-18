# Main Continuous Integration

## Workflow

`.github/workflows/main-ci.yml` (Main CI) runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. Its `quality` job initially matches the development workflow: Ubuntu 24.04, Node.js 24.21.0, pnpm 12.6.0, read-only contents permission, a ten-minute timeout, and cancellation of superseded runs for the same event and branch or PR.

Install dependencies from the frozen lockfile, then run formatting, linting, type checking, unit tests, E2E tests, the backend build, and the web app build in order. No path filters are used.

## Branch policy

After this workflow is merged through a PR, add `quality` from GitHub Actions to the existing required status checks for `main`, preserving all other branch protections.

## Bootstrap limitation

This change intentionally adds CI without merging application code from `develop`. At introduction, `main` lacks `package.json`, `pnpm-lock.yaml`, and application sources, so Main CI is expected to fail until a subsequent PR introduces the project files. Do not skip checks or weaken their commands to hide this failure.

## Verification

Compare the workflow with the development workflow, allowing only its display name and target branches to differ. Observe the initial PR and push check results, then read back the main ruleset to verify `quality` is required from GitHub Actions.
