# 0001: Hono Backend Project Baseline

## Status

Completed.

## Background

This project provides a durable REST backend baseline for a future web application. It must make later business modules predictable without prematurely implementing those features.

## Goals

- Provide a Node.js Hono HTTP service written in strict TypeScript.
- Establish modular boundaries for routes, middleware, schemas, services, and repositories.
- Supply production-minded cross-cutting behavior: request IDs, structured logs, CORS, secure headers, validated environment configuration, and consistent errors.
- Publish an OpenAPI document and Swagger UI.
- Make the baseline straightforward to validate locally through formatting, linting, type checking, tests, and production build.

## Non-goals

- Database tables, migrations, or any connection to a real PostgreSQL instance.
- Authentication, authorization, users, JWT, or business modules.
- Infrastructure beyond the application baseline.

## Technology stack and rationale

| Technology                               | Purpose and rationale                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Node.js 22+                              | Supported long-term server runtime with modern web platform APIs.                    |
| TypeScript                               | Strict compile-time safety for public APIs and module boundaries.                    |
| pnpm                                     | Fast, deterministic package management with a compact dependency store.              |
| Hono with `@hono/node-server`            | Small, web-standard REST framework for the Node.js runtime.                          |
| PostgreSQL + Drizzle ORM                 | Chosen persistence direction; only client/configuration scaffolding is included now. |
| Zod                                      | Runtime validation and inferred TypeScript types for untrusted input.                |
| `@hono/zod-openapi` + `@hono/swagger-ui` | One source of truth for validation-aware OpenAPI routes and interactive docs.        |
| Pino                                     | Low-overhead structured logs suitable for aggregation.                               |
| Vitest                                   | TypeScript-native test runner for fast integration-style API tests.                  |
| tsx + tsup                               | Development execution and a compact production build respectively.                   |
| Oxlint + Oxfmt                           | Fast Rust-based linting and formatting that replace ESLint and Prettier.             |

## Recommended directory structure

```text
src/
  main.ts                # Hono application composition
  server.ts              # Node.js HTTP server entry point
  server.spec.ts         # Colocated server unit tests
  config/
    env.ts               # Zod-validated environment settings
  lib/
    errors.ts            # Typed application errors and response helpers
    logger.ts            # Pino logger construction
  middleware/
    error-handler.ts     # Error normalization and JSON failures
    error-handler.spec.ts
    request-context.ts   # Request ID and request lifecycle logging
    security.ts          # CORS and security headers composition
  routes/
    health.ts            # Health endpoint and OpenAPI registration
    health.spec.ts
  schemas/
    health.ts            # Example Zod request/response schemas
  services/              # Future business logic
  repositories/          # Future persistence access
  db/
    client.ts            # Deferred Drizzle client wiring; no connection on import
  openapi.ts             # OpenAPI document and Swagger registration
test/
  app.e2e.spec.ts        # Full application HTTP test
spec/
  0001-project-baseline.md
```

Empty future-facing directories may include `.gitkeep` files only if needed to preserve the structure.

## API conventions

### Health check

- `GET /health` returns HTTP 200 with `{ "data": { "status": "ok" } }`.
- The route is public and has no database dependency.

### Success responses

- Return resource payloads under a top-level `data` key.
- Paginated resource APIs, when added, may use a separate top-level `meta` key defined by their specification.

### Error responses

All errors use JSON in this shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route not found",
    "requestId": "uuid"
  }
}
```

- `code` is stable and machine-readable; `message` is safe for clients.
- Validation errors use `VALIDATION_ERROR` and can include a documented `details` array of safe field issues.
- Unknown failures use `INTERNAL_ERROR`; stack traces and internal messages must never reach clients.
- Unmatched routes return 404 with `NOT_FOUND`.

## Environment variables

Runtime configuration is parsed at startup with Zod. Required variables are documented in `.env.example`; no real `.env` is committed.

| Variable       | Required            | Default / constraint                                       | Purpose                                                                        |
| -------------- | ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`     | No                  | `development`; `development`, `test`, or `production`      | Runtime mode.                                                                  |
| `PORT`         | No                  | `3000`; valid TCP port                                     | Preferred HTTP listener port; startup scans higher ports if it is occupied.    |
| `LOG_LEVEL`    | No                  | `info`                                                     | Pino severity threshold.                                                       |
| `CORS_ORIGINS` | No                  | empty                                                      | Comma-separated allow-list for `/api/*`; empty denies cross-origin API access. |
| `DATABASE_URL` | No in this baseline | Valid PostgreSQL URL when database features are introduced | Reserved for future Drizzle configuration.                                     |

## OpenAPI and Swagger

- Define public routes using `@hono/zod-openapi`, pairing Zod schemas with response documentation.
- Expose the generated document at `GET /openapi.json`.
- Serve Swagger UI at `GET /docs`.
- Any route or request/response schema change must update the OpenAPI contract and its tests as part of the same change.

## Testing strategy

- Keep Vitest unit tests beside source files using the `*.spec.ts` suffix.
- Keep E2E tests under `test/` using the Vitest-compatible `*.e2e.spec.ts` suffix.
- Use the exported Hono app via `app.request()` for focused route and middleware tests.
- Start the application on an ephemeral loopback port for E2E coverage; do not require a manually started server.
- Cover `GET /health` success behavior.
- Cover the error middleware for a known application error and an unexpected thrown error, asserting status, stable error code, and request ID.
- Add tests for each new route, validation boundary, and error response contract.
- Keep tests hermetic: no database, network, or real credentials are required for this baseline.

## Implementation plan

1. Initialize pnpm and TypeScript tooling; add scripts for `format`, `lint`, `typecheck`, `test`, `build`, `dev`, `db:generate`, and `db:migrate`.
2. Add project configuration: strict TypeScript, tsup, Vitest, Oxlint, Oxfmt, Drizzle, and `.env.example`.
3. Create the module structure and environment/logger/error primitives.
4. Compose middleware for request context, structured request logs, CORS, security headers, errors, and 404 handling.
5. Implement and document `GET /health`, then register OpenAPI JSON and Swagger UI.
6. Add integration tests for health and error behavior.
7. Write `README.md` covering install, environment setup, development, test, build, and Swagger URLs.
8. Run every quality gate, record results here, and change this specification status to Completed.

## Acceptance criteria

- `pnpm run format:check` passes.
- `pnpm run lint` passes.
- `pnpm run typecheck` passes under strict TypeScript.
- `pnpm test` passes and covers health plus error middleware.
- `pnpm run build` produces a runnable `dist/` output.
- `pnpm run dev` starts the Node.js service on `PORT` or the next available higher port; `GET /health` returns the documented success payload.
- `GET /openapi.json` returns an OpenAPI document and `GET /docs` renders Swagger UI.
- Invalid and unmatched requests return the documented JSON error format with a request ID.
- No database connection, migration, real secret, authentication mechanism, or business module is introduced.

## Verification record

Completed on 2026-08-20:

- `pnpm run format:check` passed.
- `pnpm run lint` passed.
- `pnpm run typecheck` passed.
- `pnpm test` and `pnpm run test:e2e` passed: colocated unit tests and the application E2E suite cover the health endpoint, OpenAPI/Swagger registration, known/unexpected error handling, port fallback, and readable startup address output.
- `pnpm run build` passed and produced `dist/server.js`.
- In-process integration tests verified `GET /health` and OpenAPI route registration without requiring a listening port.

The default port `3000` was already occupied by another local process. A separate isolated-port HTTP smoke test was not completed because its execution was not authorized. Run `PORT=4301 pnpm dev` locally, then request `/health`, `/openapi.json`, and `/docs` to perform that optional final network-level check.

## Tooling migration record

Completed on 2026-08-24:

- Replaced ESLint and Prettier with Oxlint and Oxfmt.
- Added `.oxlintrc.json` and `.oxfmtrc.json`, preserving the existing single-quote, no-semicolon, and trailing-comma style.
- Removed the obsolete ESLint and Prettier dependencies and configuration files.
- Verified `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` successfully.

## TypeScript import extension record

Completed on 2026-08-24:

- Internal TypeScript source and test imports now use `.ts` extensions.
- `allowImportingTsExtensions` and `noEmit` are enabled for TypeScript checking; tsup continues to emit executable `.js` production output.

## Dependency versioning rule

Completed on 2026-08-24:

- Core runtime dependencies use exact, verified versions.
- Non-core and development dependencies may use `^` or `~` ranges.
- Dependency declarations must never use `latest` or another floating distribution tag.
- TypeScript is maintained on the stable 7.0 release line (`^7.0.2`).

## Port fallback record

Completed on 2026-08-24:

- Startup now handles `EADDRINUSE` by trying each subsequent TCP port through `65535`.
- Startup logs retries structurally and prints a readable terminal block with the selected port plus the application, Swagger, and OpenAPI URLs.
- Other startup errors are surfaced without retrying.
- An integration test reserves a local port and verifies that the application starts on a higher available port.

## Direction update record

Updated on 2026-09-24:

- The product direction was set to a ticket system backend; see `spec/0002-ticket-system-roadmap.md`.
- The exploratory AI/Agent integration references in this specification were removed. The baseline scope itself is unchanged.

## API response envelope record

Updated on 2026-09-24:

- All API response shapes are governed by `spec/common/api-response-comment.md`, which supersedes the success/error shapes described in "API conventions" above. Other documents reference that file instead of restating envelope fields.
- Error bodies no longer carry `requestId`; clients use the `x-request-id` response header instead.
- Endpoints adopt the new envelope in the implementing change for that common specification; the acceptance criteria above reflect the state at their completion time.
