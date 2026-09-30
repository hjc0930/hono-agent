# 0004: tsdown Development and Build Workflow

## Status

Completed.

## Background

The completed `0003` workflow uses `tsc` to emit JavaScript in both development
and production. This decision makes `tsdown` responsible for application
compilation, development watching, and server restarts, while `tsc` remains the
type checker. The `0003` specification remains a historical record.

## Goals

- Use one tsdown configuration for development and production compilation.
- Keep `pnpm dev`, `pnpm run build`, and `pnpm start` as the public commands.
- Do not create or modify `dist/` during development; use an ignored temporary
  output directory instead.
- Produce runnable ESM at `dist/server.js` with source maps for production.
- Restart the local Node.js server after successful source rebuilds.
- Keep strict TypeScript checking through `tsc --noEmit`.
- Run type checking before initial development startup and production build.
- Keep existing application behavior, environment loading, and port fallback.

## Non-goals

- Changing route, database, or public API behavior.
- Replacing Vitest, Oxlint, Oxfmt, Drizzle, or the `tsx` dependency used by
  database maintenance scripts.
- Adding repository-owned orchestration scripts.
- Generating declaration files, minifying output, or publishing a library.

## Decision

`tsdown.config.ts` bundles `src/server.ts` for Node.js as ESM with source maps.
Runtime dependencies remain external and must be installed in the deployment
environment. The default output directory is `dist/`; `pnpm dev` overrides it
with `.tsdown-dev/`, which is ignored by Git. Both modes execute `server.js`
compiled from the same entry. tsdown cleans its selected output directory, so a
development watch never cleans or writes the production directory.

`pnpm run typecheck` continues to run `tsc --noEmit` across the application and
tests. `predev` checks types before the watcher starts. `pnpm run build` checks
types before tsdown emits the production build.
tsdown's watch mode transpiles changed source without TypeScript type checking;
developers can run the separate type-check command after changes. The initial
development startup and production build fail if type checking fails.

Development runs `tsdown --watch --on-success`: tsdown rebuilds the temporary
output and runs or restarts the Node.js server after each successful build.
There is no separate `concurrently` or `node --watch` process. Stopping
`pnpm dev` must stop the server and watcher.

The application requires the Node.js versions supported by tsdown 0.23.0:
`^22.18.0 || ^24.11.0 || >=26.0.0`. The package's engine declaration and README
must reflect this requirement. Database migration and seed scripts retain `tsx`.
The obsolete `tsconfig.build.json` and `concurrently` are removed because
TypeScript no longer emits application JavaScript and tsdown owns the watcher.
The completed `0003` spec is not rewritten. tsdown watch mode requires output
files, so development avoids `dist/` but writes an ignored temporary build.

## Verification

- `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm test`,
  `pnpm run test:e2e`, and `pnpm run build` pass.
- The build produces `dist/server.js` and `dist/server.js.map`, and the entry
  runs with `pnpm start` without a TypeScript loader.
- The production server responds at `/health`, `/openapi.json`, and `/docs`.
- With `dist/` absent, `pnpm dev` starts from `.tsdown-dev/server.js` without
  generating `dist/`.
- Editing an imported source file rebuilds the output and restarts the server;
  stopping development releases its port.
- A TypeScript error prevents `pnpm run build` and the initial `pnpm dev` build.
- No test files or stale compiler artifacts are included in the output.

## Implementation verification

- `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run test:e2e`,
  and `pnpm run build` passed.
- `pnpm dev` built `.tsdown-dev/server.js`, served all three HTTP endpoints,
  rebuilt after a source edit, restarted the Node.js process, and left the
  existing `dist/` files unchanged. The watched source edit was reverted.
- `pnpm start` served `/health`, `/openapi.json`, and `/docs` from the tsdown
  production build.
- Repository-wide formatting, linting, and type checks passed after the
  concurrent ticket-category changes were formatted with Oxfmt.
