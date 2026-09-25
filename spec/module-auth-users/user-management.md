# User Management

Module: `module-auth-users` · Batch: Phase 1 · Related: `login.md`, `rbac.md`, `login-protection.md`, `common/api-response-comment.md`, `common/pagination.md`

## Status

Draft — awaiting review. No implementation yet.

## Background

`login.md` defines credential issuance; `rbac.md` defines the guards. This spec adds the admin-only management surface over the `users` table: create, list, read, update (role/status/display name), and password reset. It is the first admin-only CRUD module and the first list endpoint, so it exercises `requireRole('admin')` and establishes the pagination convention.

## Goals

- Admin-only endpoints under `/api/users` for create, paginated list with filters, read, update, and password reset.
- A protection rule so an admin cannot lock themselves or the last admin out of the system.
- Password hashing reused from `login.md` (no new hashing code).
- Pagination and filtering following `common/pagination.md`.

## Non-goals

- Physical deletion: users are disabled, not deleted, because future tickets reference `requester_id`/`handler_id`.
- Self-service password change or registration.
- Email delivery, invitations, or bulk import.
- Per-user role change taking effect immediately on active tokens (role changes keep the 15-minute staleness documented in `common/auth-conventions.md`).

## Decisions

| Topic               | Decision                                                                       | Rationale                                                                      |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Username mutability | `username` is immutable after creation                                         | Avoids re-running uniqueness checks on update and keeps log correlation stable |
| Self-protection     | An admin cannot disable their own account or change their own `role`           | Prevents lockout: at least one enabled admin must remain                       |
| Password reset      | Admin supplies the new password (8–128 chars); the endpoint returns no payload | Simple and auditable; a temporary-password generator is deferred               |
| Deletion            | None; `PATCH` sets `status: 'disabled'`                                        | Future FK references require the row to persist                                |
| Creation defaults   | `role` defaults to `user`; `status` always starts `active`                     | Least-privilege by default                                                     |
| Display name        | Optional free-form label; unrelated to login                                   | `username` is the identity, `displayName` is cosmetic                          |
| List shape          | `data` is an array of public users, `meta` carries pagination                  | Follows `common/pagination.md`                                                 |

## API contract

All routes are guarded by `requireAuth` then `requireRole('admin')`. Responses use the common envelope; list responses use `common/pagination.md`. The public user object is the `publicUserSchema` from `login.md` (id, username, displayName, role, status — never `password_hash`).

### POST /api/users

Create a user. Request body:

| Field         | Type   | Validation                             |
| ------------- | ------ | -------------------------------------- |
| `username`    | string | `/^[a-z0-9_-]{3,32}$/`, unique         |
| `password`    | string | 8–128 chars                            |
| `displayName` | string | optional, `min(1)` trimmed             |
| `role`        | enum   | `admin`/`agent`/`user`, default `user` |

Success `200` — `data`: the created public user. Status is `active`.

Errors: `400 VALIDATION_ERROR`; `409 USERNAME_TAKEN` when the username already exists.

### GET /api/users

Paginated list. Query: `page`, `pageSize` (per `common/pagination.md`), plus optional filters `role`, `status`, and `keyword` (substring match on `username` or `displayName`, case-insensitive).

Success `200` — `data`: array of public users (sorted by `createdAt` ascending), `meta`: pagination.

### GET /api/users/:id

Read one user. Success `200` — `data`: public user. Errors: `404 USER_NOT_FOUND`.

### PATCH /api/users/:id

Update `displayName`, `role`, or `status` (any subset). Request body:

| Field         | Type   | Validation                       |
| ------------- | ------ | -------------------------------- |
| `displayName` | string | optional, `min(1)` trimmed       |
| `role`        | enum   | optional, `admin`/`agent`/`user` |
| `status`      | enum   | optional, `active`/`disabled`    |

At least one field must be present. Success `200` — `data`: updated public user. Errors: `400 VALIDATION_ERROR`; `404 USER_NOT_FOUND`; `403 SELF_MODIFICATION_FORBIDDEN` when the caller targets themselves and the change would disable them or alter their `role`.

### POST /api/users/:id/reset-password

Request body: `{ "password": string }` (8–128 chars). Success `200` — bare envelope, no `data`. Errors: `400 VALIDATION_ERROR`; `404 USER_NOT_FOUND`.

## Data model

No new tables or migration. Reuses `users` from `login.md`:

- `role`, `status`, `displayName` are the mutable fields via `PATCH`.
- `username`, `passwordHash` are immutable (except `passwordHash` via `reset-password`).
- `updatedAt` is refreshed on every update.

## Repository changes

`UserRepository` (defined in `login.md`) gains:

- `list(filter: { page, pageSize, role?, status?, keyword? }): Promise<{ items: UserRecord[]; total: number }>`
- `update(id: string, patch: Partial<Pick<NewUser, 'displayName' | 'role' | 'status'>>): Promise<UserRecord | null>`
- `countByUsername(username: string): Promise<number>` (or reuse `findByUsername`)

The `MemoryUserRepository` fake implements the same interface for hermetic tests.

## Error codes

| Code                          | HTTP | Used by                          |
| ----------------------------- | ---- | -------------------------------- |
| `USER_NOT_FOUND`              | 404  | get, update, reset-password      |
| `USERNAME_TAKEN`              | 409  | create                           |
| `SELF_MODIFICATION_FORBIDDEN` | 403  | update (self role/status change) |

## Architecture mapping

| Path                                                            | Responsibility                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/routes/users.ts` (+ `users.spec.ts`)                       | Routes + OpenAPI, guarded by `requireRole('admin')`                                    |
| `src/schemas/user.ts`                                           | Zod request/response schemas, pagination meta                                          |
| `src/services/user-management.ts` (+ `user-management.spec.ts`) | Business logic: validation, uniqueness, self-protection, hashing via `lib/password.ts` |
| `src/repositories/user-repository.ts`                           | Add `list` / `update` / `countByUsername`                                              |
| `src/repositories/fakes.ts`                                     | Mirror the interface in `MemoryUserRepository`                                         |

## Testing strategy

Colocated unit tests only (no E2E; see AGENTS.md).

Service (fake repository): create (success + `USERNAME_TAKEN`); list (pagination arithmetic, empty list, filters); get (found + `USER_NOT_FOUND`); update (role/status/displayName, self-protection rejects disabling self and changing own role, `USER_NOT_FOUND`); reset-password (roundtrip: new password verifies, old password fails).

Route (`app.request` + fake repos): each endpoint's success envelope, the 403 self-protection, 404, 409, 400 validation, and the list `meta` shape.

## Acceptance criteria

- All five endpoints work as specified and are admin-only (non-admin returns 403; unauthenticated returns 401).
- An admin cannot disable themselves or change their own role.
- List responses follow `common/pagination.md`; `meta.totalPages` is correct including the empty case.
- No new migration; `updatedAt` is refreshed on updates.
- Quality gates (format, lint, typecheck, unit tests, build) pass.

## Open questions

- Temporary generated passwords on reset — deferred until email delivery exists.
- Whether `keyword` should also match `id` — deferred; username/displayName only for now.
