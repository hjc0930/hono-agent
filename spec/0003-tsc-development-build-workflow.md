# 0003: TypeScript Compiler Development and Build Workflow

## Status

Completed.

## Background

The application currently uses two TypeScript transformation tools:

- `tsx watch src/server.ts` executes TypeScript directly during development and restarts the server after source changes.
- `tsup` bundles the production entry point into `dist/server.js`.

The project is expected to remain a small-to-medium Node.js backend and does not currently require bundling, code splitting, minification, or build plugins. Using different transformation tools in development and production also means that the two environments do not execute the same form of application output.

The application development and production build workflows will therefore use the TypeScript compiler (`tsc`) as their only TypeScript transformation tool. Development and production will both execute JavaScript emitted by `tsc`.

`tsc` does not run applications or restart server processes. Node.js remains the runtime, and its built-in watch mode is responsible for restarting the development server when emitted JavaScript changes.

## Goals

- Use `tsc` for all application TypeScript checking and JavaScript emission.
- Run emitted JavaScript in both development and production.
- Emit development and production files into the same `dist/` directory with the same directory and file structure.
- Keep development and production compiler semantics aligned.
- Preserve automatic incremental compilation and server restart during development.
- Preserve strict type checking and prevent emission when type errors exist.
- Preserve ESM output compatible with Node.js 22 and the package's `"type": "module"` setting.
- Preserve source maps for useful development and production stack traces.
- Remove `tsup` from the application production build.
- Remove `tsx` from the application development-server workflow.
- Keep development and build orchestration in `package.json` without repository-owned scripts.
- Keep `pnpm dev`, `pnpm run build`, and `pnpm start` as the public commands.

## Non-goals

- Changing application behavior, public APIs, environment handling, logging, or port fallback.
- Bundling the server into a single file.
- Minifying production output.
- Generating declaration files for package consumers.
- Replacing Vitest, Drizzle Kit, Oxlint, or Oxfmt.
- Changing database migration or seed behavior unless a separate specification includes those scripts.
- Using Node.js native TypeScript type stripping to execute source files.

## Decision

The workflow is divided by responsibility:

| Stage                   | TypeScript tool | Runtime        | Input                                         | Output                     |
| ----------------------- | --------------- | -------------- | --------------------------------------------- | -------------------------- |
| Full type check         | `tsc`           | None           | Application, tests, and project configuration | No emitted files           |
| Development compilation | `tsc --watch`   | None           | `src/**/*.ts` excluding tests                 | `dist/**/*.js`             |
| Development execution   | None            | `node --watch` | `dist/server.js` and its imported modules     | Running development server |
| Production build        | `tsc`           | None           | `src/**/*.ts` excluding tests                 | `dist/**/*.js`             |
| Production execution    | None            | `node`         | `dist/server.js`                              | Running production server  |

All TypeScript-to-JavaScript transformation is performed by `tsc`. Node.js only executes emitted JavaScript and manages development restarts.

## TypeScript configuration

The project will use two TypeScript configuration files. Development compilation and production builds must use the same emitting configuration.

### `tsconfig.json`

`tsconfig.json` remains the complete project type-checking configuration. It must:

- Preserve the existing strictness options.
- Preserve `module: "NodeNext"` and `moduleResolution: "NodeNext"`.
- Preserve `noEmit: true`.
- Include application source, colocated unit tests, E2E tests, and TypeScript configuration files that require checking.
- Remain the configuration used by `pnpm run typecheck`.

The type-checking command remains:

```bash
tsc --noEmit
```

### `tsconfig.build.json`

`tsconfig.build.json` extends `tsconfig.json` and defines production emission. It must set or override:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "./src",
    "outDir": "./dist",
    "sourceMap": true,
    "rewriteRelativeImportExtensions": true,
    "noEmitOnError": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts"]
}
```

The final implementation may add incremental-build metadata settings, but those settings must not cause development and production to emit different application files.

Both `pnpm dev` and `pnpm run build` must compile with `tsconfig.build.json`. Development enables the compiler's command-line watch mode; it does not use a separate emitting configuration. Development and production therefore use the same output directory, file structure, target, module system, module resolution, import rewriting, and source-map behavior.

## Relative import extensions

Internal source imports currently use `.ts` extensions, for example:

```ts
import { createApp } from './main.ts'
```

Emitted JavaScript must contain runtime-resolvable `.js` imports:

```js
import { createApp } from './main.js'
```

The shared emitting configuration must enable `rewriteRelativeImportExtensions`. The migration must not require a repository-wide change from `.ts` source imports to `.js` source imports.

## Development workflow

Development requires two long-running processes:

```text
src/**/*.ts changes
        |
        v
tsc --project tsconfig.build.json --watch
        |
        v
dist/**/*.js changes
        |
        v
node --watch dist/server.js
        |
        v
development server restarts
```

Node.js must watch the emitted JavaScript dependency graph, not the TypeScript source directory. This prevents a source change from restarting the server before the corresponding compiler output is available.

Before the two watch processes start, development must clean `dist/` and perform one successful initial compilation. This ensures that `dist/server.js` exists before Node.js starts and that deleted or renamed source modules do not leave stale development output.

The effective commands are:

```bash
tsc --project tsconfig.build.json
tsc --project tsconfig.build.json --watch --preserveWatchOutput
node --watch --watch-preserve-output --enable-source-maps dist/server.js
```

## Development process orchestration

The public `pnpm dev` command must keep its orchestration in `package.json` without adding repository-owned files under `scripts/`.

The `predev` lifecycle script must clean known compiler output with TypeScript build mode and complete one successful initial compilation. The `dev` script must then use `concurrently` to start `tsc --watch` and Node.js watch mode together.

`concurrently` is the only additional development dependency permitted for process orchestration. It must terminate the remaining watcher when either long-running process exits. It must not perform TypeScript transformation itself.

## Production build workflow

The production build must:

1. Remove stale production output.
2. Compile `src/` with `tsconfig.build.json`.
3. Fail without producing an updated runnable build when TypeScript errors exist.
4. Produce `dist/server.js` and its source map.
5. Preserve the source directory structure under `dist/`.

Unlike the current bundled output, the expected tsc output contains multiple JavaScript modules:

```text
dist/
  server.js
  server.js.map
  main.js
  main.js.map
  config/
  db/
  lib/
  middleware/
  repositories/
  routes/
  schemas/
  services/
```

Multiple output files are an intentional consequence of using `tsc` and are not a build failure.

## Output cleanup

Plain `tsc` emission does not remove JavaScript files whose corresponding source files were deleted or renamed. The workflow must clean `dist/` before a production build so stale modules cannot remain deployable.

The development workflow must also clean `dist/` once, before its initial compilation. It must not clean the directory during watch-mode recompilations.

Cleanup must use TypeScript build mode so only outputs known to `tsconfig.build.json` are removed:

```bash
tsc --build tsconfig.build.json --clean
```

`dist/` and TypeScript build metadata must remain ignored by Git.

Because development and production intentionally share `dist/`, `pnpm run build` must not run concurrently with an active `pnpm dev` process. A production build cleans and rewrites the same directory watched by the development server.

## Package scripts

After migration, the application-facing scripts must be equivalent to:

```json
{
  "scripts": {
    "predev": "tsc --build tsconfig.build.json --clean && tsc --project tsconfig.build.json",
    "dev": "concurrently --kill-others --names tsc,node \"tsc --project tsconfig.build.json --watch --preserveWatchOutput\" \"node --watch --watch-preserve-output --enable-source-maps dist/server.js\"",
    "typecheck": "tsc --noEmit",
    "build": "tsc --build tsconfig.build.json --clean && tsc --project tsconfig.build.json",
    "start": "node --enable-source-maps dist/server.js"
  }
}
```

The final script names may differ if the implementation remains equally explicit, adds no repository-owned orchestration files, and preserves the existing public commands.

## Dependency changes

- Remove `tsup` from `devDependencies` after the production build no longer uses it.
- Delete `tsup.config.ts` after all required settings have been represented in TypeScript configuration.
- Stop using `tsx` in the `dev` script.
- Add `concurrently` as a development-only process manager.
- Do not remove `tsx` from `devDependencies` while `db:migrate`, `db:seed`, or another retained script still requires it.
- A later migration may compile or otherwise replace those database-script entry points and then remove `tsx` completely.

## Error behavior

- Initial development compilation errors must prevent the server from starting.
- Production compilation errors must fail the build and must not leave a newly emitted partial build.
- During watch mode, a failed recompilation must be reported without intentionally restarting the server onto invalid output.
- The last successfully emitted development server may continue running while a subsequent source edit contains type errors.
- Fixing the errors must emit updated JavaScript and trigger a server restart without manually restarting `pnpm dev`.

## Documentation changes

Implementation must update:

- `README.md` development, build, and production instructions.
- `AGENTS.md` command descriptions and architecture notes where they mention tsup.
- `spec/0001-project-baseline.md` with a dated tooling migration record; historical records must remain intact.
- `.gitignore` if the implementation introduces a new TypeScript build metadata location.

Documentation must describe `tsc` as the compiler and Node.js as the runtime. It must not claim that `tsc` runs or restarts the server.

## Testing and verification

Implementation must run the smallest relevant checks while iterating and all repository quality gates before handoff:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run build
pnpm start
```

Development verification must also confirm:

1. `pnpm dev` starts successfully from a state where `dist/` does not exist.
2. Editing a valid imported source file causes tsc emission and one effective server restart.
3. Introducing a type error reports the error and does not replace the running server with invalid output.
4. Fixing the error resumes emission and restarts the server.
5. Interrupting `pnpm dev` terminates both the compiler watcher and the Node.js watcher.

HTTP smoke verification must confirm that these routes remain available after both development startup and a production build:

- `GET /health`
- `GET /openapi.json`
- `GET /docs`

## Acceptance criteria

- `tsx` is not used to run the application development server.
- `tsup` is not used for the application production build.
- Every application JavaScript file executed in development or production is emitted by `tsc`.
- Development and production emit the same application files into `dist/` by using `tsconfig.build.json`.
- Development and production share the same TypeScript module and target semantics.
- Source `.ts` import extensions are rewritten to executable `.js` imports.
- `pnpm dev` performs an initial compilation, watches source files, and restarts the server after successful emission.
- `pnpm run build` produces a clean, runnable `dist/` directory without test files.
- `pnpm start` runs `dist/server.js` without a TypeScript runtime loader.
- Type errors prevent initial development startup and production build success.
- Source maps resolve runtime stack traces to TypeScript source locations.
- Existing API behavior, tests, environment loading, logging, and port fallback remain unchanged.
- No third-party compiler, bundler, or TypeScript runtime loader is added; `concurrently` is used only to manage the two development watcher processes.

## Implementation plan

1. Add `tsconfig.build.json` as the single emitting configuration.
2. Add any compiler metadata path introduced by the implementation to `.gitignore`.
3. Verify that `rewriteRelativeImportExtensions` produces runnable Node.js ESM output.
4. Configure safe development and production orchestration directly in `package.json`.
5. Replace the application `dev` and `build` package scripts.
6. Verify that development and production produce the same files under `dist/`.
7. Verify production compilation and `node dist/server.js` before removing tsup.
8. Remove `tsup` and `tsup.config.ts`.
9. Retain or remove `tsx` according to the remaining database and maintenance scripts.
10. Update project documentation and the baseline migration record.
11. Run all quality gates, watch-mode checks, and HTTP smoke checks.

## Verification record

Completed on 2026-09-29:

- `pnpm run format:check`, `pnpm run lint`, and `pnpm run typecheck` passed.
- `pnpm test` passed 22 files and 180 tests.
- `pnpm run test:e2e` passed one file and four tests, including port fallback and the health, OpenAPI, Swagger UI, and not-found routes.
- `pnpm run build` produced a clean multi-file `dist/` tree with source maps, no test files, and `.js` relative imports rewritten from the source `.ts` extensions.
- A deliberate production type error caused the build to fail without leaving `dist/server.js`; removing the error restored a successful build.
- `pnpm start` ran the compiled entry point, and HTTP smoke checks passed for `/health`, `/openapi.json`, and `/docs`.
- `pnpm dev` succeeded with no existing `dist/`, compiled with tsc watch mode, and ran `dist/server.js` with Node.js watch mode.
- Development and build orchestration is contained in `package.json`; no repository-owned `scripts/` files are required.
- A valid source edit emitted JavaScript and restarted the server. A deliberate type error reported the compiler error without restarting the server; fixing it resumed emission and restart.
- Interrupting `pnpm dev` terminated the watchers and released the development port.
