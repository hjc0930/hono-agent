# Ticket CRUD

Module: `module-tickets` · Batch: Phase 2 · Related: `ticket-categories.md`, `ticket-state-machine.md`, `ticket-assignment.md`, `ticket-comments.md`, `module-auth-users/rbac.md`, `common/pagination.md`

## Status

Draft — awaiting review. No implementation yet.

## Background

This spec defines the core `tickets` entity: creation, paginated list with filters, and detail. State transitions, assignment, and comments are separate specs. It establishes the visibility model — who can see which tickets — which is the central authorization rule of the ticket system.

## Goals

- `tickets` table with title, description, category, priority, status, requester, handler, and lifecycle timestamps.
- Create a ticket; list tickets with multi-condition filters; read a ticket.
- A role-based visibility rule: requesters see only their own tickets, agents and admins see all.
- Responses follow `common/api-response-comment.md`; the list follows `common/pagination.md`.

## Non-goals

- State transitions and their validation (`ticket-state-machine.md`).
- Assignment and self-claim (`ticket-assignment.md`).
- Comments (`ticket-comments.md`).
- Attachments, custom fields, SLA, notifications.

## Decisions

| Topic | Decision | Rationale |
| ----- | -------- | --------- |
| Priority | enum `low`/`medium`/`high`/`urgent`, default `medium` | Four tiers cover the roadmap's needs without over-configuring |
| Status | enum `pending`/`in_progress`/`resolved`/`closed`/`cancelled`, default `pending` | The state machine from `ticket-state-machine.md` |
| Create access | Any authenticated role | Agents and admins may file tickets on behalf of a customer |
| Requester on create | Defaults to the caller; agents/admins may specify another `requesterId` | Lets an agent file a ticket for a customer |
| Visibility | `user` sees only `requester_id = self`; `agent`/`admin` see all | Core tenant isolation without a separate tenancy table |
| List sort | `created_at` descending | Newest first, the usual ticket queue view |
| Description | Required, `max(5000)`; `title` `max(200)` | Bounds for a plain-text MVP |
| Category on create | Must reference an existing, enabled category | Prevents orphaned or retired categories on new work |

## API contract

All routes require `requireAuth`. `POST` is open to every authenticated role; `GET` applies the visibility rule in the service layer.

The public ticket object (used by create/list/detail responses):

```json
{
  "id": "uuid",
  "title": "登录失败",
  "description": "用户无法登录，提示密码错误",
  "categoryId": "uuid",
  "priority": "medium",
  "status": "pending",
  "requesterId": "uuid",
  "handlerId": null,
  "createdAt": "2026-09-25T08:30:00.000Z",
  "updatedAt": "2026-09-25T08:30:00.000Z"
}
```

### POST /api/tickets

Create a ticket. Request body:

| Field         | Type   | Validation                                   |
| ------------- | ------ | -------------------------------------------- |
| `title`       | string | `min(1)`, `max(200)`, trimmed                |
| `description` | string | `min(1)`, `max(5000)`                        |
| `categoryId`  | string | uuid, must reference an enabled category     |
| `priority`    | enum   | optional, `low`/`medium`/`high`/`urgent`, default `medium` |
| `requesterId` | string | optional uuid; only agents/admins may set it, default is the caller |

Success `200` — `data`: the created ticket (`status` is `pending`, `handlerId` is `null`).

Errors: `400 VALIDATION_ERROR`; `400 INVALID_CATEGORY` when `categoryId` is missing or disabled; `403 FORBIDDEN` when a `user` tries to set a `requesterId` other than themselves.

### GET /api/tickets

Paginated list. Query: `page`, `pageSize` (per `common/pagination.md`), plus optional filters:

| Query         | Type   | Meaning                                  |
| ------------- | ------ | ---------------------------------------- |
| `status`      | enum   | exact status match                       |
| `priority`    | enum   | exact priority match                     |
| `categoryId`  | uuid   | exact category match                     |
| `requesterId` | uuid   | exact requester match                    |
| `handlerId`   | uuid   | exact handler match                      |
| `keyword`     | string | substring on `title`/`description`, case-insensitive |
| `createdFrom` | ISO date | `created_at >=`                       |
| `createdTo`   | ISO date | `created_at <=`                       |

Visibility: a `user` role always has `requesterId` forced to their own id (an explicit `requesterId` filter that differs is ignored, not honored); `agent`/`admin` see all.

Success `200` — `data`: array of tickets, `meta`: pagination.

### GET /api/tickets/:id

Read one ticket. Success `200` — `data`: ticket. Errors: `404 TICKET_NOT_FOUND`; `403 FORBIDDEN` when a `user` requests a ticket they did not file.

## Data model

### `tickets`

| Column         | Type        | Null | Default              | Constraints / notes                     |
| -------------- | ----------- | ---- | -------------------- | --------------------------------------- |
| `id`           | uuid        | no   | `gen_random_uuid()`  | PK                                      |
| `title`        | text        | no   | —                    |                                         |
| `description`  | text        | no   | —                    |                                         |
| `category_id`  | uuid        | no   | —                    | FK → `ticket_categories.id`             |
| `priority`     | ticket_priority | no | `'medium'`         | pgEnum                                  |
| `status`       | ticket_status | no  | `'pending'`          | pgEnum                                  |
| `requester_id` | uuid        | no   | —                    | FK → `users.id`                         |
| `handler_id`   | uuid        | yes  | —                    | FK → `users.id`, nullable               |
| `resolved_at`  | timestamptz | yes  | —                    | set on transition to `resolved`         |
| `closed_at`    | timestamptz | yes  | —                    | set on transition to `closed`           |
| `created_at`   | timestamptz | no   | `now()`              |                                         |
| `updated_at`   | timestamptz | no   | `now()`              | refreshed on update                     |

Two new enums: `ticket_priority` (`low`, `medium`, `high`, `urgent`) and `ticket_status` (`pending`, `in_progress`, `resolved`, `closed`, `cancelled`). This is part of the second migration alongside `ticket_categories`.

## Error codes

| Code                  | HTTP | Used by                    |
| --------------------- | ---- | -------------------------- |
| `TICKET_NOT_FOUND`    | 404  | get                        |
| `INVALID_CATEGORY`    | 400  | create (bad `categoryId`)  |

`FORBIDDEN` (403) is reused for visibility denials and the requester-override rule.

## Architecture mapping

| Path | Responsibility |
| ---- | -------------- |
| `src/routes/tickets.ts` (+ `.spec.ts`) | Routes + OpenAPI, guarded by `requireAuth` |
| `src/schemas/ticket.ts` | Zod request/response schemas |
| `src/services/ticket.ts` (+ `.spec.ts`) | Creation (category check, requester override), visibility-filtered list/read |
| `src/repositories/ticket-repository.ts` | Drizzle implementation + interface |
| `src/repositories/fakes.ts` | In-memory fake |
| `src/db/schema.ts` | `tickets` table + enums |

## Testing strategy

Colocated unit tests only. Service tests use the fake repository and a fake user context; route tests use `createApp` with fakes injected.

Cover: create (success, `INVALID_CATEGORY`, requester-override allowed for agent/admin and denied for user, validation); list (pagination, each filter, `user` forced to own tickets vs `agent` seeing all); get (found, `TICKET_NOT_FOUND`, `user` denied another's ticket); authorization (unauthenticated 401).

## Acceptance criteria

- The second migration creates `tickets` with the two enums and FKs exactly as specified.
- Create enforces the enabled-category and requester-override rules.
- List and detail enforce the visibility rule per role.
- Quality gates (format, lint, typecheck, unit tests, build) pass.

## Open questions

- Whether `user` can set `priority` (currently allowed; could restrict to agents later).
- Default list sort by `updated_at` instead of `created_at` — deferred until activity tracking exists.
