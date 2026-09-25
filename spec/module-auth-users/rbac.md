# RBAC Guards and Role Semantics

Module: `module-auth-users` · Batch: Phase 1 · Related: `login.md`, `login-protection.md`, `user-management.md`, `common/auth-conventions.md`

## Status

Draft — awaiting review. No implementation yet.

## Background

`login.md` defines how identity is issued (JWT access token with `sub` and `role` claims). This spec defines how the application consumes that identity: the route-guard middleware, the role authorization semantics for the three roles, and the first protected route that exercises them. It owns the 401/403 behavior of every guarded route from here on.

## Goals

- `requireAuth` and `requireRole(...)` guard middleware with a precise, testable contract.
- Explicit role allow-lists per route as the single authorization mechanism (no implicit hierarchy).
- A typed request context (`userId`, `userRole`) that downstream services can rely on.
- `GET /api/auth/me` as the first guarded route, validating the guards end to end (in-process).
- A documented `bearerAuth` security scheme in the OpenAPI document.

## Non-goals

- Token issuance, refresh, logout (`login.md`).
- Login rate limiting / lockout (`login-protection.md`).
- Admin-only user CRUD routes (`user-management.md`).
- Fine-grained permission points, per-resource ACLs, permission tables, or role hierarchy sugar.
- Immediate global disable enforcement (a disabled user keeps access up to one access-token TTL; see D4).

## Role semantics

Roles are the fixed enum from `login.md`: `admin`, `agent`, `user`. Capability direction from the roadmap (0002): `admin` can do everything `agent` can; `agent` and `user` have different (not nested) capabilities on tickets. Authorization is therefore **not** modeled as a hierarchy — every protected route declares exactly the set of roles that may call it:

| Route family (as of this spec)          | Allowed roles     | Declared by |
| --------------------------------------- | ----------------- | ----------- |
| `POST /api/auth/login`                  | public            | `login.md`  |
| `POST /api/auth/refresh`                | public            | `login.md`  |
| `POST /api/auth/logout`                 | any authenticated | `login.md`  |
| `GET /api/auth/me`                      | any authenticated | this spec   |
| `GET /health`, `/openapi.json`, `/docs` | public            | baseline    |

Future modules extend this table in their own specs; `user-management.md` adds the first `admin`-only routes. `requireRole('agent')` must reject `admin` — adding both roles explicitly (`requireRole('agent', 'admin')`) is the documented way to express "agents and admins".

## API contract

### GET /api/auth/me

OpenAPI: tag `Auth`, operationId `me`. Requires `Authorization: Bearer <accessToken>`.

This endpoint **re-reads** the user from the repository (unlike the guards, which trust token claims), so it reflects role/status changes immediately. Frontends call it to hydrate session state.

Success `200` — `data` payload (envelope per `common/api-response-comment.md`):

```json
{
  "id": "0b6b0d6a-7fd2-4c1a-9f3e-a1e2f3c4d5e6",
  "username": "admin",
  "displayName": "Administrator",
  "role": "admin",
  "status": "active"
}
```

Same shape as the `user` object in the login response; never includes `password_hash`.

Errors:

| Status | Code                    | When                                                       |
| ------ | ----------------------- | ---------------------------------------------------------- |
| 401    | `UNAUTHORIZED`          | Missing, malformed, expired, or bad-signature access token |
| 401    | `UNAUTHORIZED`          | Token valid but `sub` no longer resolves to a user         |
| 403    | `AUTH_ACCOUNT_DISABLED` | Fresh user read returns `status = 'disabled'`              |

No request body. No route in this spec accepts input beyond the `Authorization` header.

## Decisions and implementation details

### D1. Explicit role allow-lists, no hierarchy

`requireRole(...allowed: UserRole[])` checks membership only. There is no `atLeast('agent')` helper and no implicit admin privilege: a route meant for agents and admins declares `requireRole('agent', 'admin')`. Rationale: agent vs user capabilities are not nested, so a hierarchy would be misleading; explicit lists keep every route's authorization greppable in one line. If repetition becomes painful, a future spec can add named permission constants — not now.

### D2. Guard contract

Both guards live in `src/middleware/guards.ts` and are plain Hono middleware (factory-created, like `requestContext`).

**`requireAuth`** — runs before `requireRole` on every protected route:

1. Read the `Authorization` header. Missing, or not exactly `Bearer <token>` (case-insensitive scheme, single space) → throw `unauthorizedError()`.
2. `verifyAccessToken(token)` (from `login.md`, `src/lib/access-token.ts`) returns `{ sub, role }` or `null`. `null` (expired, wrong signature, wrong algorithm, malformed) → throw `unauthorizedError()`. The guard never inspects the reason — every invalid-token case is the same 401.
3. On success: `context.set('userId', sub)`, `context.set('userRole', role)`, then `await next()`.

No database access and no status check — by design (D4). The `sub`/`role` claims are trusted for the token's lifetime.

**`requireRole(...allowed)`** — always mounted after `requireAuth`:

1. Read `context.get('userRole')`. Undefined → throw `unauthorizedError()`. This is defensive: it catches a misordered or missing `requireAuth` instead of failing open.
2. `allowed.includes(userRole)` → `await next()`; otherwise → throw `forbiddenError()`.

Guards throw `AppError` only; the existing error handler renders the common failure envelope (`common/api-response-comment.md`), and the `x-request-id` header set by `requestContext` still reaches every guarded failure.

### D3. Request-context types and error constructors

- `src/types.ts`: `AppVariables` gains `userId: string` and `userRole: UserRole`; add `export type UserRole = 'admin' | 'agent' | 'user'`. The string-literal union lives here (not in `db/schema.ts`) so libs and fakes never import Drizzle. The `user_role` pgEnum in `db/schema.ts` must be typed as this union to keep them identical.
- `src/lib/errors.ts`: add `unauthorizedError()` → `new AppError(401, 'UNAUTHORIZED', 'Authentication required')` and `forbiddenError()` → `new AppError(403, 'FORBIDDEN', 'Insufficient permissions')`. `login.md`'s flows may reuse `unauthorizedError()` for `AUTH_INVALID_REFRESH_TOKEN` by constructing `AppError` directly where the code differs.

### D4. Trust model: claims on the hot path, re-read where it matters

Guards never touch the database; a disabled account therefore keeps working until its access token expires (≤ `AUTH_ACCESS_TOKEN_TTL_SECONDS`, default 15 minutes) unless a route re-reads. This is the accepted trade-off from `login.md` D2 and is documented in `common/auth-conventions.md`. Rules:

- Normal routes: trust `userId`/`userRole` from the token; do not re-read the user.
- Routes that need fresh truth (currently only `me`): re-read the user in the service; missing → 401 `UNAUTHORIZED`, disabled → 403 `AUTH_ACCOUNT_DISABLED`. These are service-level checks, not guard features.
- `user-management.md` must route every sensitive admin action through this rule or accept the staleness explicitly in its spec.

### D5. Route attachment convention

Guards are declared on the route itself via `createRoute({ middleware: [requireAuth, requireRole('admin')] })` (supported by `@hono/zod-openapi`), so the OpenAPI route definition and its authorization are one unit — no parallel path-based whitelist in `main.ts` to drift. Constraints:

- Public routes declare no guard middleware; they must not be added to any global `app.use`.
- Guards run inside the normal chain after `requestContext` / `securityHeaders` / `apiCors`; nothing in this spec reorders existing middleware.
- If a future route cannot express its guard via `createRoute` middleware, that is a spec change, not an ad-hoc bypass.

### D6. OpenAPI security scheme

`src/openapi.ts` registers a `bearerAuth` HTTP security scheme (`type: http`, `scheme: bearer`, `bearerFormat: JWT`). Protected routes set `security: [{ bearerAuth: [] }]` in their `createRoute` config; public routes set `security: []` explicitly. Swagger UI then shows an Authorize button and protected routes render the lock icon. This is documentation only — it does not enforce anything.

### D7. CORS preflight interplay

`apiCors` (mounted on `/api/*` ahead of any route middleware) answers `OPTIONS` preflight requests directly, before guards run. Preflight therefore needs no `Authorization` header and must never be answered 401. A guard regression here (e.g., moving auth to a global `app.use` before CORS) is covered by a dedicated test (see case matrix).

## Data model

None. This spec adds no tables and no migration. `UserRole` is the only new type (D3).

## Error codes

| Code                    | HTTP | Used by                                | Message                    |
| ----------------------- | ---- | -------------------------------------- | -------------------------- |
| `UNAUTHORIZED`          | 401  | both guards; `me` (unresolvable `sub`) | `Authentication required`  |
| `FORBIDDEN`             | 403  | `requireRole` on role mismatch         | `Insufficient permissions` |
| `AUTH_ACCOUNT_DISABLED` | 403  | `me` (fresh read, disabled account)    | `Account is disabled`      |

`AUTH_ACCOUNT_DISABLED` is defined in `login.md`; this spec reuses it unchanged.

## Architecture mapping

| Path                                            | Responsibility                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/middleware/guards.ts` (+ `guards.spec.ts`) | `requireAuth`, `requireRole`; the only place tokens are verified for routing |
| `src/routes/auth.ts` (+ `auth.spec.ts`)         | Adds the `me` route and its OpenAPI registration                             |
| `src/services/auth.ts` (+ `auth.spec.ts`)       | `getCurrentUser(userId)` — fresh repository read, disabled check             |
| `src/lib/errors.ts`                             | `unauthorizedError()`, `forbiddenError()` constructors                       |
| `src/types.ts`                                  | `UserRole`, extended `AppVariables`                                          |
| `src/openapi.ts`                                | `bearerAuth` security scheme registration                                    |

No repository changes: `me` reads by id through the existing `UserRepository.findById` from `login.md`.

## Testing strategy

Colocated unit tests only; no E2E content (per AGENTS.md, E2E lives in its own spec).

### Layout

| File                            | Kind | Covers                                                            |
| ------------------------------- | ---- | ----------------------------------------------------------------- |
| `src/middleware/guards.spec.ts` | unit | Guard contract on a scratch Hono app with signed test tokens      |
| `src/routes/auth.spec.ts`       | unit | `me` on the composed app: success, 401, 403, OpenAPI registration |
| `src/services/auth.spec.ts`     | unit | `getCurrentUser` against fake repository                          |
| `src/lib/errors.spec.ts`        | unit | New constructors produce the exact status/code/message            |

### Fixtures

- `signTestToken({ sub, role, expiresInSec })` helper in the guard spec signs real HS256 tokens with the test `JWT_SECRET`; expired/garbage tokens are produced by tuning `expiresInSec` or mutating the signed string.
- Guard tests mount `requireAuth` (+ `requireRole`) on a scratch `Hono()` app with a probe route returning `{ userId, userRole }` from context — no OpenAPI machinery needed for pure middleware semantics.
- `me` tests use the composed `createApp` with an in-memory `UserRepository` fake from `src/repositories/fakes.ts` (`login.md`).

### Case matrix — requireAuth (scratch app)

1. No `Authorization` header → 401 `UNAUTHORIZED`; failure body follows `common/api-response-comment.md`.
2. Header without `Bearer ` prefix (`Token abc`) → 401.
3. Malformed token (`Bearer not-a-jwt`) → 401.
4. Expired token (`expiresInSec: -1`) → 401.
5. Token signed with a different secret → 401.
6. Token with `alg: none` / foreign algorithm → 401 (verifier rejects; guard maps to the same 401).
7. Valid token → next runs; probe sees `userId`/`userRole` exactly as claimed; response body reflects them.

### Case matrix — requireRole (scratch app, mounted after requireAuth)

1. Role in allow-list → next runs.
2. Role not in allow-list → 403 `FORBIDDEN`.
3. **`admin` token against `requireRole('agent')` → 403** (proves no implicit hierarchy; D1).
4. `userRole` absent from context (requireRole mounted without requireAuth) → 401 (defensive ordering check).
5. Allow-list with multiple roles (`requireRole('agent', 'admin')`) passes both and rejects `user`.

### Case matrix — me route (composed app)

1. Valid token, active user → 200, body matches the Zod response schema; `password_hash` never present.
2. Valid token, `sub` not in fake repository → 401 `UNAUTHORIZED`.
3. Valid token, user disabled → 403 `AUTH_ACCOUNT_DISABLED` (fresh read, not token claims).
4. No/invalid/expired token → 401 `UNAUTHORIZED` (guard contract, but asserted on the real route).
5. Every failure response keeps the `x-request-id` response header (the envelope body carries no `requestId`).

### Case matrix — OpenAPI and middleware order

1. `GET /openapi.json` contains `bearerAuth` security scheme; `me` route carries `security: [{ bearerAuth: [] }]`; public routes (login, health) carry `security: []`.
2. `OPTIONS` preflight to a protected path is answered by CORS (2xx, no auth headers required) — D7 regression test.
3. Guard failures follow the common failure envelope and keep the `x-request-id` response header.

## Acceptance criteria

- `requireAuth` / `requireRole` implement the contract in D2 exactly, with no database access in the guard path.
- `GET /api/auth/me` matches the API contract, including the disabled → 403 and unresolvable-sub → 401 mappings.
- Role authorization is allow-list-based; no hierarchy exists anywhere in the code (case matrix 3 guards this).
- `AppVariables`, `UserRole`, and the two error constructors exist as specified; existing `requestId` behavior is unchanged.
- OpenAPI document includes the `bearerAuth` scheme and correct per-route `security` declarations.
- Every case-matrix row above exists as a passing test; quality gates (format, lint, typecheck, unit tests, build) pass. This spec adds no migration and no E2E changes.

## Open questions

- Named permission constants (e.g., `ROLES_TICKET_HANDLERS = ['agent', 'admin']`) if allow-list repetition grows — deferred until a second module repeats the same lists.
- Global immediate-disable enforcement (guard-level repository check) is deliberately rejected for now; revisit only if the 15-minute staleness becomes a real problem.
- Fine-grained permission points beyond the three roles — deferred, likely unnecessary at this scale.
