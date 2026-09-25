# Ticket Categories

Module: `module-tickets` · Batch: Phase 2 · Related: `tickets-crud.md`, `module-auth-users/rbac.md`, `common/api-response-comment.md`, `common/pagination.md`

## Status

Draft — awaiting review. No implementation yet.

## Background

Tickets are organized by category (for example "账号问题", "设备故障", "软件咨询"). This spec defines the category entity and its admin-managed CRUD surface. It is the first module of Phase 2 and establishes the `ticket_categories` table that `tickets-crud.md` will reference. Categories are deliberately simple and independent so they can be delivered first and settle the ticket-domain conventions.

## Goals

- A `ticket_categories` table: name (unique), optional description, enable/disable flag, timestamps.
- Admin-only create and update; read access for every authenticated role (agents and requesters pick a category when working with tickets).
- No physical deletion: categories are disabled via `enabled`, because tickets reference them.
- Pagination and filtering follow `common/pagination.md`; responses follow `common/api-response-comment.md`.

## Non-goals

- Category hierarchy or nesting.
- Per-category default priority, SLA, or assignment rules (deferred to Phase 3).
- Physical deletion or cascade behavior.
- Category statistics (ticket counts per category) — deferred to reporting.

## Decisions

| Topic | Decision | Rationale |
| ----- | -------- | --------- |
| Deletion | None; `PATCH` sets `enabled: false` | Future tickets reference `category_id`, so the row must persist |
| Write access | `admin` only (create/update) | Categories are a small admin-maintained vocabulary |
| Read access | Any authenticated role (`requireAuth`) | Agents and requesters need the list to file/route tickets |
| Name uniqueness | `name` is unique (case-sensitive, trimmed) | Prevents two categories that are textually identical |
| Name mutability | `name` is mutable via `PATCH` | Renaming a category should not require delete + recreate |
| Default sort | `created_at` ascending | Stable, matches `user-management` convention |
| Route prefix | `/api/ticket-categories` | Keeps the ticket domain explicit |

## API contract

All write routes are guarded by `requireAuth` then `requireRole('admin')`; read routes by `requireAuth` only. Responses use the common envelope; the list uses `common/pagination.md`.

The public category object:

```json
{
  "id": "uuid",
  "name": "账号问题",
  "description": "登录、密码、权限相关",
  "enabled": true
}
```

### POST /api/ticket-categories

Create a category. Request body:

| Field         | Type   | Validation                       |
| ------------- | ------ | -------------------------------- |
| `name`        | string | `min(1)`, `max(64)`, trimmed, unique |
| `description` | string | optional, `max(255)`, trimmed    |

Success `200` — `data`: the created category (`enabled` defaults to `true`).

Errors: `400 VALIDATION_ERROR`; `409 CATEGORY_NAME_TAKEN` when `name` already exists.

### GET /api/ticket-categories

Paginated list. Query: `page`, `pageSize` (per `common/pagination.md`), plus optional `enabled` (`true`/`false`) and `keyword` (substring match on `name` or `description`, case-insensitive).

Success `200` — `data`: array of categories, `meta`: pagination.

### GET /api/ticket-categories/:id

Read one category. Success `200` — `data`: category. Errors: `404 CATEGORY_NOT_FOUND`.

### PATCH /api/ticket-categories/:id

Update `name`, `description`, or `enabled` (any subset). Request body:

| Field         | Type    | Validation                    |
| ------------- | ------- | ----------------------------- |
| `name`        | string  | optional, `min(1)`, `max(64)`, trimmed, unique |
| `description` | string  | optional, `max(255)`, trimmed, nullable |
| `enabled`     | boolean | optional                      |

At least one field must be present. Success `200` — `data`: updated category. Errors: `400 VALIDATION_ERROR`; `404 CATEGORY_NOT_FOUND`; `409 CATEGORY_NAME_TAKEN`.

## Data model

### `ticket_categories`

| Column        | Type        | Null | Default               | Constraints / notes            |
| ------------- | ----------- | ---- | --------------------- | ------------------------------ |
| `id`          | uuid        | no   | `gen_random_uuid()`   | PK                             |
| `name`        | text        | no   | —                     | unique index                   |
| `description` | text        | yes  | —                     |                                |
| `enabled`     | boolean     | no   | `true`                |                                |
| `created_at`  | timestamptz | no   | `now()`               |                                |
| `updated_at`  | timestamptz | no   | `now()`               | refreshed on update            |

This is the second migration (after the Phase 1 `users`/`refresh_tokens` tables).

## Error codes

| Code                  | HTTP | Used by                    |
| --------------------- | ---- | -------------------------- |
| `CATEGORY_NOT_FOUND`  | 404  | get, update                |
| `CATEGORY_NAME_TAKEN` | 409  | create, update (name)      |

## Architecture mapping

| Path | Responsibility |
| ---- | -------------- |
| `src/routes/ticket-categories.ts` (+ `.spec.ts`) | Routes + OpenAPI, guarded by `requireAuth`/`requireRole('admin')` |
| `src/schemas/ticket-category.ts` | Zod request/response schemas |
| `src/services/ticket-category.ts` (+ `.spec.ts`) | Business logic: uniqueness check, updates |
| `src/repositories/ticket-category-repository.ts` | Drizzle implementation + interface |
| `src/repositories/fakes.ts` | In-memory fake for hermetic tests |
| `src/db/schema.ts` | `ticket_categories` table |

## Testing strategy

Colocated unit tests only (no E2E, per AGENTS.md). Service tests use the in-memory fake repository; route tests use `createApp` with the fake injected.

Cover: create (success + `CATEGORY_NAME_TAKEN`); list (pagination, `enabled` filter, `keyword` filter, empty result); get (found + `CATEGORY_NOT_FOUND`); update (name/description/enabled, name conflict, `CATEGORY_NOT_FOUND`, empty body rejected); authorization (unauthenticated 401, non-admin write 403, authenticated read allowed).

## Acceptance criteria

- The second migration creates `ticket_categories` exactly as specified.
- Admin-only write, authenticated read, no physical deletion.
- List follows `common/pagination.md`; responses follow `common/api-response-comment.md`.
- Quality gates (format, lint, typecheck, unit tests, build) pass.

## Open questions

- Whether disabled categories should be hidden from agents/requesters by default (currently the `enabled` query filter is explicit).
- Category ordering by a `sortOrder` field — deferred; `created_at` is sufficient until reordering is requested.
