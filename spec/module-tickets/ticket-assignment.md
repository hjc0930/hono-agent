# Ticket Assignment

Module: `module-tickets` · Batch: Phase 2 · Related: `tickets-crud.md`, `ticket-state-machine.md`, `module-auth-users/rbac.md`

## Status

Draft — awaiting review. No implementation yet.

## Background

Assigning a ticket hands it to a handler (an agent). This spec defines admin-driven assignment and how it interacts with the state machine (`pending → in_progress`). Self-claim by agents is deliberately deferred.

## Goals

- Admin assigns a ticket to a handler (an agent or admin).
- Assignment validates that the handler is an active agent/admin (never a `user`, never disabled).
- Assigning a `pending` ticket advances it to `in_progress` via the state machine; reassigning an already `in_progress` ticket changes the handler without further status change.

## Non-goals

- Agent self-claim ("take this ticket") — deferred.
- Bulk assignment or round-robin distribution.
- Assignment rules tied to category/priority — deferred to Phase 3.

## Decisions

| Topic | Decision | Rationale |
| ----- | -------- | --------- |
| Assign access | `admin` only | The roadmap scopes manual assignment to admin |
| Handler eligibility | `role` is `agent` or `admin`, and `status` is `active` | Never assign to a requester or a disabled account |
| Status coupling | Assigning a `pending` ticket transitions it to `in_progress`; otherwise the status is unchanged | Keeps assignment and the state machine consistent |
| Reassignment | Allowed while `in_progress` (changes `handler_id`) | Handoffs happen; terminal states reject it via the state machine |
| Endpoint | `POST /api/tickets/:id/assign` | Explicit action, distinct from generic update |

## API contract

### POST /api/tickets/:id/assign

Guarded by `requireAuth` then `requireRole('admin')`.

Request body:

| Field       | Type   | Validation                                        |
| ----------- | ------ | ------------------------------------------------- |
| `handlerId` | string | uuid of an active agent/admin user                |

Success `200` — `data`: the updated ticket (with `handlerId` set and, if it was `pending`, `status` now `in_progress`).

Errors: `400 VALIDATION_ERROR`; `400 INVALID_HANDLER` when the target user is missing, disabled, or a `user` role; `404 TICKET_NOT_FOUND`; `400 INVALID_STATE_TRANSITION` when the ticket is in a terminal state (`closed`/`cancelled`).

## Data model

No new tables. Uses `tickets.handler_id` (from `tickets-crud.md`) and `ticket_events` (from `ticket-state-machine.md`). Assignment writes a timeline event when it also changes status.

## Error codes

| Code                  | HTTP | Used by                    |
| --------------------- | ---- | -------------------------- |
| `INVALID_HANDLER`     | 400  | assign (bad `handlerId`)   |

`INVALID_STATE_TRANSITION` is reused for terminal-state assignments.

## Architecture mapping

| Path | Responsibility |
| ---- | -------------- |
| `src/routes/tickets.ts` (+ `.spec.ts`) | `assign` route + OpenAPI |
| `src/schemas/ticket.ts` | assign request/response schemas |
| `src/services/ticket-assignment.ts` (+ `.spec.ts`) | Handler validation + status coupling |
| `src/repositories/ticket-repository.ts` | `assign` method (handler + optional status change) |

## Testing strategy

Colocated unit tests only. Cover: assign to a valid agent (pending → in_progress); assign to a valid agent on an `in_progress` ticket (handler changes, status unchanged); `INVALID_HANDLER` for a `user`/disabled/missing target; `INVALID_STATE_TRANSITION` for terminal tickets; authorization (non-admin 403).

## Acceptance criteria

- Admin-only assignment with handler eligibility enforced.
- `pending → in_progress` coupling works; reassignment does not change status.
- Timeline event written when assignment changes status.
- Quality gates pass.

## Open questions

- Agent self-claim endpoint — deferred; revisit after admin assignment is proven.
- Whether admin may assign to themselves — currently allowed (admin is an eligible handler).
