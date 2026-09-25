# Login and Token Issuance

Module: `module-auth-users` · Batch: Phase 1 · Related: `rbac.md`, `login-protection.md`, `user-management.md`, `common/auth-conventions.md`

## Status

Draft — awaiting review. No implementation yet.

## Background

First database-backed module of the ticket roadmap (0002, Phase 1). It introduces the `users` table, credential login, and the token pair that every protected route will consume. Route-guard and role semantics live in `rbac.md`; failure-path protection in `login-protection.md`; admin user management in `user-management.md`.

## Goals

- Credential login, logout, and token refresh endpoints under `/api/auth/*`.
- Short-lived JWT access tokens plus opaque, revocable, rotating refresh tokens.
- Password hashing with Node's built-in scrypt; no new runtime dependencies.
- The `users` and `refresh_tokens` tables with the project's first Drizzle migration.
- An idempotent seed script that creates the initial admin account.

## Non-goals

- Rate limiting and account lockout (`login-protection.md`).
- Route guards and role semantics (`rbac.md`).
- Admin user CRUD, enable/disable, password reset (`user-management.md`).
- Self-service password change, email-based reset, MFA, "remember me", active-session listing.
- Password complexity rules beyond length bounds.

## API contract

All endpoints are public (no `Authorization` header) except logout. All request bodies are flat JSON. Every response uses the unified envelope from `common/api-response-comment.md`; this section therefore documents only each endpoint's `data` payload and its error codes. Validation failures return `400 VALIDATION_ERROR` with field issues in `errors.message`.

### POST /api/auth/login

OpenAPI: tag `Auth`, operationId `login`.

Request headers: `Content-Type: application/json`.

Request body (Zod `loginRequestSchema`):

| Field      | Type   | Validation             |
| ---------- | ------ | ---------------------- |
| `username` | string | `/^[a-z0-9_-]{3,32}$/` |
| `password` | string | `min(8)`, `max(128)`   |

Request example:

```json
{ "username": "admin", "password": "correct-horse-battery" }
```

Success `200` — `data` payload (the response schema wraps this object in the common envelope):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshToken": "dB0fHcy9RCaSq0jLq_mV6aFtg5IUNIXPQkSaq3J0_0s",
  "user": {
    "id": "0b6b0d6a-7fd2-4c1a-9f3e-a1e2f3c4d5e6",
    "username": "admin",
    "displayName": "Administrator",
    "role": "admin",
    "status": "active"
  }
}
```

- `expiresIn` repeats `AUTH_ACCESS_TOKEN_TTL_SECONDS` so clients need no extra config.
- `user` never includes `password_hash`.

Errors:

| Status | Code                       | When                                       | Message                          |
| ------ | -------------------------- | ------------------------------------------ | -------------------------------- |
| 400    | `VALIDATION_ERROR`         | Body fails schema                          | Field issues in `errors.message` |
| 401    | `AUTH_INVALID_CREDENTIALS` | Unknown username **or** wrong password     | `Invalid username or password`   |
| 403    | `AUTH_ACCOUNT_DISABLED`    | Correct credentials, `status = 'disabled'` | `Account is disabled`            |

The 401 body for "unknown user" and "wrong password" must be byte-identical apart from the envelope `date` (see implementation details, "user-enumeration protection").

Processing order: schema validation → load user → password verify (with dummy fallback) → disabled check → issue tokens. The disabled check runs **after** a successful password verify, so a wrong-password caller never learns that the account exists or is disabled.

### POST /api/auth/refresh

OpenAPI: tag `Auth`, operationId `refresh`.

Request body (Zod `refreshRequestSchema`):

| Field          | Type   | Validation              |
| -------------- | ------ | ----------------------- |
| `refreshToken` | string | `/^[A-Za-z0-9_-]{43}$/` |

Success `200` — `data` payload: a fresh `{ accessToken, tokenType, expiresIn, refreshToken }` — a fresh pair; the presented token is now invalid (rotation).

Errors: `400 VALIDATION_ERROR`; `401 AUTH_INVALID_REFRESH_TOKEN` with message `Invalid refresh token` for an unknown, expired, rotated, or revoked token. Presenting a rotated or revoked token additionally revokes **all** refresh tokens of that user (reuse detection).

### POST /api/auth/logout

OpenAPI: tag `Auth`, operationId `logout`. Requires `Authorization: Bearer <accessToken>`.

Request body: same shape as refresh.

Success `200`: bare envelope with no `data` (a mutation without payload, per `common/api-response-comment.md`).

Errors:

| Status | Code                         | When                                     |
| ------ | ---------------------------- | ---------------------------------------- |
| 401    | `UNAUTHORIZED`               | Access token missing/invalid/expired     |
| 401    | `AUTH_INVALID_REFRESH_TOKEN` | Refresh token unknown or already revoked |

Logout has no side effects beyond revoking the presented token (no revoke-all; that reaction is reserved for reuse detection on `/refresh`).

## Decisions and implementation details

### D1. Token strategy — JWT access + rotating opaque refresh

**Access token.** JWT HS256 via Hono's built-in `hono/jwt`.

- Header: `{ "alg": "HS256", "typ": "JWT" }`; verification pins `alg` to HS256 and rejects anything else.
- Claims: `sub` (user id, string UUID), `role` (`admin` | `agent` | `user`), `iat`, `exp = iat + AUTH_ACCESS_TOKEN_TTL_SECONDS`. No PII beyond the id.
- Signing key: `JWT_SECRET` from the environment schema.
- `verifyAccessToken(token)` returns `{ sub, role }` or `null`; it never throws. Expired signature counts as `null`.

**Refresh token.** `crypto.randomBytes(32).toString('base64url')` → exactly 43 chars `[A-Za-z0-9_-]`. Storage stores only `sha256(rawToken)` as hex; the raw value exists only in the HTTP response and the client.

**Rotation model — rows are immutable, never rewritten.** Rotation must keep the old row so a replayed token still resolves to a known, revoked row:

1. `findByHash(sha256(presented))`.
2. Row not found → 401, no side effects.
3. Row found and `revoked_at` is set → **reuse**: `revokeAllForUser(user_id)` (set `revoked_at = now()` on every active row of that user) → 401.
4. Row found and `expires_at <= now()` → 401 (no side effects; a lazy cleanup job may delete expired rows later under a separate spec).
5. Otherwise: in one transaction, `revoke(oldRow.id)` and `insert(newRow)` with a fresh random token and `expires_at = now() + AUTH_REFRESH_TOKEN_TTL_SECONDS`; sign a new access token; return the pair.

Because every row's `token_hash` is unique, this flow is race-safe for a single PostgreSQL instance without row locks; two concurrent refreshes with the same token collapse into one success and one reuse-revocation.

### D2. Role claim and staleness

`role` rides in the access token so guards need no database read (guard semantics: `rbac.md`). Consequence: an admin role change takes effect at most one access TTL later (default 15 minutes). This limit is documented in `common/auth-conventions.md`; anything needing immediate effect must re-read the user row.

### D3. Password hashing — scrypt (node:crypto, zero new dependencies)

Implemented as pure functions in `src/lib/password.ts`:

- `hashPassword(password: string): Promise<string>`
  - salt = `randomBytes(16)`; digest length 64; params N=16384, r=8, p=1.
  - Uses the **async** `crypto.scrypt` (promisified) so verification never blocks the event loop; `maxmem` left at the Node default (32 MiB ≥ the ~16 MiB these params require).
  - Encoding: `scrypt$N$r$p$<salt-base64>$<hash-base64>` — e.g. `scrypt$16384$8$1$Qeo1...$9AB2...`. Params live in the string so they can be raised later without invalidating every stored hash.
- `verifyPassword(password: string, encoded: string): Promise<boolean>`
  - Parses N, r, p, salt, hash from the stored string; re-derives with the **stored** params; compares 64-byte digests with `crypto.timingSafeEqual`.
  - Malformed stored string (bad format, out-of-range params, base64) → returns `false`, never throws (surfaced as ordinary auth failure; logged at `warn` with no password material).

Password length is capped at 128 by the request schema, bounding scrypt input cost.

### D4. User-enumeration protection (timing and body)

When `findByUsername` returns null, the service still runs `verifyPassword(password, DUMMY_HASH)` against a module-level constant (a real scrypt string for a random 16-byte salt) before answering 401. Both failure paths then produce the same status, code, and message; the only observable difference is the envelope `date`.

### D5. Request/response envelope convention

Request bodies stay flat (no `data` wrapper). Response shapes are governed entirely by `common/api-response-comment.md`; this module only decides which optional fields each endpoint uses: login and refresh return `data`, logout returns none.

### D6. Initial admin — seed script

`src/db/seed.ts`, run via new package script `pnpm run db:seed` (tsx). Behavior:

1. Validate config with a pure, unit-testable `validateSeedConfig(env)` → `{ username, password }` or a listed error:
   - `SEED_ADMIN_PASSWORD` missing, or not 8–128 chars → error (refuse; never default the password).
   - `SEED_ADMIN_USERNAME` missing → default `admin`; must satisfy the username regex.
   - `DATABASE_URL` missing → error.
2. Connect with the Drizzle client; if the username already exists → log `seed skipped: user exists` and exit 0 (idempotent).
3. Otherwise insert `{ username, password_hash: await hashPassword(password), role: 'admin', status: 'active' }`; log `seed created admin user` (username only).
4. Exit codes: 0 = created or skipped, 1 = invalid config or database failure. The password value is never logged.

### D7. Test isolation — repository interfaces with injectable fakes

- `UserRepository`: `findByUsername(username)`, `findById(id)`, `insert(newUser)`.
- `RefreshTokenRepository`: `findByHash(hash)`, `insert(newToken)`, `revoke(id)`, `revokeAllForUser(userId)`.
- `createApp({ userRepository?, refreshTokenRepository? } = {})` defaults to the Drizzle implementations; tests pass in-memory fakes. Production startup uses the defaults; the composition root is the only place that touches Drizzle wiring.
- Pure helpers (`hashPassword`, `verifyPassword`, `verifyAccessToken`) take primitives only, so they are tested without any fake.

### D8. Environment validation changes

Extended `envSchema` in `src/config/env.ts`:

| Variable                         | Rule                                                 |
| -------------------------------- | ---------------------------------------------------- |
| `JWT_SECRET`                     | required, `z.string().min(32)` — startup fails fast  |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS`  | `z.coerce.number().int().positive().default(900)`    |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | `z.coerce.number().int().positive().default(604800)` |
| `SEED_ADMIN_USERNAME`            | optional string, validated by the seed script        |
| `SEED_ADMIN_PASSWORD`            | optional string, validated by the seed script        |

Making `JWT_SECRET` required changes existing test/dev behavior; the same change adds it to `.env.example` (with generation hint `openssl rand -base64 48`) and sets it in the Vitest setup file so all existing suites remain hermetic.

## Data model

PostgreSQL enums (Drizzle `pgEnum`): `user_role` = `admin` | `agent` | `user`; `user_status` = `active` | `disabled`.

### `users`

| Column          | Type          | Null | Default             | Constraints / notes                           |
| --------------- | ------------- | ---- | ------------------- | --------------------------------------------- |
| `id`            | uuid          | no   | `gen_random_uuid()` | PK                                            |
| `username`      | text          | no   | —                   | unique index; `/^[a-z0-9_-]{3,32}$/` on write |
| `password_hash` | text          | no   | —                   | `scrypt$N$r$p$salt$hash` format               |
| `display_name`  | text          | yes  | —                   | free-form label for UI                        |
| `role`          | `user_role`   | no   | `'user'`            |                                               |
| `status`        | `user_status` | no   | `'active'`          |                                               |
| `created_at`    | timestamptz   | no   | `now()`             |                                               |
| `updated_at`    | timestamptz   | no   | `now()`             | repository sets it on every update            |

### `refresh_tokens`

| Column       | Type        | Null | Default | Constraints / notes                        |
| ------------ | ----------- | ---- | ------- | ------------------------------------------ |
| `id`         | uuid        | no   | uuid    | PK                                         |
| `user_id`    | uuid        | no   | —       | FK → `users.id` ON DELETE CASCADE, indexed |
| `token_hash` | text        | no   | —       | unique index; SHA-256 hex (64 chars)       |
| `expires_at` | timestamptz | no   | —       | set at insert from the refresh TTL         |
| `revoked_at` | timestamptz | yes  | —       | null = active                              |
| `created_at` | timestamptz | no   | `now()` |                                            |

Migration: first Drizzle migration (`pnpm run db:generate` after schema changes; review before applying, per AGENTS.md).

## Error codes

| Code                         | HTTP | Used by               | Message                        |
| ---------------------------- | ---- | --------------------- | ------------------------------ |
| `AUTH_INVALID_CREDENTIALS`   | 401  | login                 | `Invalid username or password` |
| `AUTH_ACCOUNT_DISABLED`      | 403  | login                 | `Account is disabled`          |
| `AUTH_INVALID_REFRESH_TOKEN` | 401  | refresh, logout       | `Invalid refresh token`        |
| `UNAUTHORIZED`               | 401  | logout (guards: rbac) | `Authentication required`      |

## Architecture mapping

| Path                                                 | Responsibility                               |
| ---------------------------------------------------- | -------------------------------------------- |
| `src/routes/auth.ts` (+ `auth.spec.ts`)              | Routes, OpenAPI registration, status mapping |
| `src/schemas/auth.ts`                                | Zod request/response schemas                 |
| `src/services/auth.ts` (+ `auth.spec.ts`)            | Login/refresh/logout flows, reuse detection  |
| `src/lib/password.ts` (+ `password.spec.ts`)         | scrypt hash/verify (pure)                    |
| `src/lib/access-token.ts` (+ `access-token.spec.ts`) | JWT sign/verify (pure), consumed by guards   |
| `src/repositories/user-repository.ts`                | Drizzle `UserRepository`                     |
| `src/repositories/refresh-token-repository.ts`       | Drizzle `RefreshTokenRepository`             |
| `src/repositories/fakes.ts`                          | In-memory implementations for tests          |
| `src/db/schema.ts`                                   | `users`, `refresh_tokens`, enums             |
| `src/db/seed.ts`                                     | `validateSeedConfig` + bootstrap admin       |
| `src/config/env.ts`                                  | New variables per D8                         |

## Testing strategy

### Layout

| File                           | Kind | Covers                                                |
| ------------------------------ | ---- | ----------------------------------------------------- |
| `src/lib/password.spec.ts`     | unit | hashing primitives, no fakes                          |
| `src/lib/access-token.spec.ts` | unit | sign/verify, expiry, pinned algorithm                 |
| `src/services/auth.spec.ts`    | unit | flows with fake repositories                          |
| `src/routes/auth.spec.ts`      | unit | app.request()-level status/error-shape/OpenAPI checks |
| `src/db/seed.spec.ts`          | unit | `validateSeedConfig` only (no database)               |

### Fakes and fixtures

- `MemoryUserRepository` / `MemoryRefreshTokenRepository` in `src/repositories/fakes.ts`: `Map`-backed, mirror the interface semantics (including `revoked_at` behavior).
- Builder helpers: `makeUser({ ...overrides })`, `makeRefreshToken({ ...overrides })` with sane defaults; tests never construct rows by hand.
- Fixed test constants for tokens (43-char base64url) and a pre-agreed `DUMMY_HASH`-style scrypt string; no real secrets anywhere.

### Case matrix — password (unit)

1. `verifyPassword(hashPassword(p), stored)` roundtrip true.
2. Wrong password → false.
3. Different salt → different hash for the same password (uniqueness).
4. Stored string malformed (bad format / bad base64 / non-numeric params) → false, no throw.
5. Params are actually read from the stored string (hash with non-default N verifies).

### Case matrix — access token (unit)

1. Verify roundtrip returns `{ sub, role }`.
2. Expired token → null (fake clock or TTL of 1s).
3. Wrong signature (different secret) → null.
4. Token with `alg: none` or a foreign algorithm → null.

### Case matrix — service flows (unit, fake repos)

Login: ① correct credentials → tokens issued + refresh row inserted; ② unknown user → 401 `AUTH_INVALID_CREDENTIALS`, and response body deep-equals the wrong-password case (modulo `date`); ③ wrong password → same; ④ disabled account with correct password → 403 `AUTH_ACCOUNT_DISABLED`; ⑤ disabled account with wrong password → 401 (not 403); ⑥ unknown user performs a dummy verification (fake repo counts `findByUsername` calls; assert the verify path still runs — via injectable clock/spy on the password module or by asserting identical timing-insensitive behavior).

Refresh: ① valid → new pair, old row revoked, new row active; ② replayed old token → all user rows revoked + 401; ③ expired → 401, nothing revoked; ④ unknown → 401, nothing revoked; ⑤ concurrent-style: second refresh with the already-rotated token triggers the reuse branch (sequence of two calls).

Logout: ① valid bearer + valid refresh → row revoked, bare success envelope (no `data`); ② unknown refresh → 401 `AUTH_INVALID_REFRESH_TOKEN`, nothing else revoked; ③ already-revoked refresh → 401, no revoke-all.

Seed: ① missing password → error listed; ② short password → error; ③ bad username → error; ④ valid → `{ username: 'admin', password }` (function output only; no DB touched in this unit test).

### Route-level assertions (`routes/auth.spec.ts`)

- Each endpoint: 200 shape matches the Zod response schema (OpenAPI-validated).
- 400 validation: username regex violation, password too short/long, malformed refresh token.
- Failure responses carry the common envelope fields per `common/api-response-comment.md`; `requestId` stays header-only via `x-request-id`.
- OpenAPI document contains all three paths with tag `Auth`.

## Acceptance criteria

- First migration creates `users` and `refresh_tokens` with the enums, defaults, and indexes exactly as specified.
- `pnpm run db:seed` is idempotent, refuses a missing/weak `SEED_ADMIN_PASSWORD`, and never logs the password.
- Startup fails fast when `JWT_SECRET` is missing or shorter than 32 characters; `.env.example` and the Vitest setup keep dev/tests working.
- Login, refresh, and logout match the API contract, including byte-identical credential errors, rotation, and reuse-revocation.
- Every case-matrix row above exists as a passing test; all quality gates (format, lint, typecheck, unit tests, build) pass.

## Open questions

- Should logout accept an optional "revoke all sessions" flag? Deferred; MVP revokes only the presented token.
- Expired refresh rows accumulate until manually cleaned; a cleanup job belongs to a future `sla-jobs`-style decision.
- Should a real-database integration suite (throwaway PostgreSQL) be introduced later as a common decision? Deferred until a module requires SQL-level coverage.
