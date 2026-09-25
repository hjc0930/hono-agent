# Hono Agent Backend

REST backend baseline for a ticket system backend (see `spec/`). It currently provides only shared engineering infrastructure; it does not connect to PostgreSQL or include authentication or business features.

## Requirements

- Node.js 22 or newer
- pnpm

## Install

```bash
pnpm install
cp .env.example .env
```

Do not commit `.env`. The baseline runs without `DATABASE_URL`; that variable is reserved for a future database specification.

## Environment variables

| Name           | Default       | Description                                          |
| -------------- | ------------- | ---------------------------------------------------- |
| `NODE_ENV`     | `development` | `development`, `test`, or `production`               |
| `PORT`         | `3000`        | HTTP server port                                     |
| `LOG_LEVEL`    | `info`        | Pino log level                                       |
| `CORS_ORIGINS` | empty         | Comma-separated browser origins allowed for `/api/*` |
| `DATABASE_URL` | empty         | Reserved PostgreSQL URL; unused by this baseline     |

## Commands

```bash
pnpm dev
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run test:watch
pnpm run build
```

Unit tests use the `*.spec.ts` suffix and live beside the source they cover. The application E2E
suite follows the NestJS directory convention at `test/app.e2e.spec.ts`.

Formatting is provided by Oxfmt and linting by Oxlint. Their project configuration lives in `.oxfmtrc.json` and `.oxlintrc.json`.

After `pnpm dev`, the service exposes:

- `GET /health` — health check
- `GET /openapi.json` — OpenAPI 3.1 document
- `GET /docs` — Swagger UI

If `PORT` is already occupied, startup automatically tries the next port and continues upward until it can listen. On success, the terminal prints a readable block with the selected port and these addresses:

```text
application: http://localhost:<port>
swagger:     http://localhost:<port>/docs
openApi:     http://localhost:<port>/openapi.json
```

## Project conventions

Read [AGENTS.md](./AGENTS.md) and the relevant document in `spec/` before making changes. Routes own HTTP behavior; services own business logic; repositories own persistence access. New capabilities require a specification and corresponding tests.

Internal TypeScript source imports use the `.ts` extension. The project enables TypeScript's `allowImportingTsExtensions` with `noEmit` for checking, while tsup bundles the production output into executable `.js` files.
