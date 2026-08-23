# AGENTS.md

This file defines how agents should work in the Hono Agent Backend repository.

## Development Commands

The project requires Node.js 22+ and pnpm. Run commands from the repository root.

### Setup and local server

- `pnpm install` — install dependencies from the lockfile.
- `cp .env.example .env` — create local configuration; never commit `.env`.
- `pnpm dev` — start the development server.
- `PORT=<port> pnpm dev` — prefer a specific local port. If occupied, the server searches higher ports and prints the selected application, Swagger UI, and OpenAPI URLs.
- `pnpm start` — run the compiled production server from `dist/`.

### Quality checks

- `pnpm run format` — format supported files with Oxfmt.
- `pnpm run format:check` — verify formatting without changing files.
- `pnpm run lint` — run Oxlint.
- `pnpm run typecheck` — run TypeScript checking without emitting files.
- `pnpm test` — run the entire Vitest suite.
- `pnpm test -- tests/integration/<file>.test.ts` — run one integration test file while iterating.
- `pnpm run build` — build the production server into `dist/` with tsup.

### Database commands

- `pnpm run db:generate` — generate Drizzle artifacts after a schema change.
- `pnpm run db:migrate` — apply a migration after it has been reviewed and created.

## Working Rules

- Read the relevant document in `spec/` before changing code or configuration.
- Treat every new feature or material behavior change as incomplete until its specification and tests are updated.
- Make small, reviewable changes. Do not perform unrelated refactors.
- Preserve public API behavior unless the relevant specification explicitly changes it.
- Run the smallest relevant check while iterating; before handoff, run formatting, linting, type checking, tests, and build.
- Do not edit generated `dist/` output by hand; regenerate it with `pnpm run build`.

## Architecture

- `src/main.ts` composes the Hono application; `src/server.ts` owns Node.js startup and port fallback.
- Keep HTTP routing and response concerns in `routes/` and `middleware/`.
- Put request and response validation schemas in `schemas/`, business logic in `services/`, and persistence access in `repositories/`.
- Routes must not access the database directly.
- Validate all external input with Zod and update OpenAPI definitions whenever public API contracts change.
- Internal TypeScript imports use the `.ts` extension. TypeScript checks with `noEmit`; tsup produces the executable `.js` build.

## Testing

- Write permanent tests in TypeScript under `tests/`.
- Every new behavior or bug fix requires focused test coverage.
- Test both success and failure paths, including relevant boundary cases.
- Keep tests hermetic: do not require a live database, network access, real credentials, or a manually started server.
- Prefer focused assertions and fixtures over broad test setup.

## Code Style and Logging

- Use Oxfmt and Oxlint; do not add ESLint or Prettier without an approved specification change.
- Keep comments concise and explain only information not obvious from the code.
- Use Pino for application logs. Do not add ad-hoc `console.log` or `debugger` calls; the readable startup address block in `src/server.ts` is the intentional exception.
- Never log request bodies or sensitive headers unless a specification explicitly permits a safely redacted form.

## Dependencies

- Pin core runtime dependencies to exact, verified versions.
- Non-core and development dependencies may use `^` or `~` ranges.
- Never use `latest` or another floating distribution tag in dependency declarations.
- Do not add dependencies unless they are necessary for the active specification.

## Security and Secrets

- Never read, print, commit, or create real API keys, tokens, passwords, cookies, authorization headers, or production connection strings.
- Use `.env.example` only for variable names and safe placeholder values.
- Do not connect to a production database or apply migrations unless the user explicitly requests it.
