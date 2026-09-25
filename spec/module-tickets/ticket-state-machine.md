# Ticket State Machine

Module: `module-tickets` · Batch: Phase 2 · Related: `tickets-crud.md`, `ticket-assignment.md`, `ticket-comments.md`, `module-auth-users/rbac.md`

## Status

Draft — awaiting review. No implementation yet.

## Background

A ticket's `status` must only move along legal transitions (for example a `closed` ticket can never change again). This spec defines the state machine, the immutable `ticket_events` timeline that records every transition, and the validation that rejects illegal moves. Assignment (`pending → in_progress`) is defined here and consumed by `ticket-assignment.md`.

## Goals

- A finite set of legal transitions over `pending`, `in_progress`, `resolved`, `closed`, `cancelled`.
- Every transition validated in the service layer; illegal transitions return `INVALID_STATE_TRANSITION`.
- An append-only `ticket_events` record per transition (who, when, from → to).
- Lifecycle timestamps (`resolved_at`, `closed_at`) set on the relevant transitions.

## Non-goals

- Automatic auto-close after N days (deferred to Phase 3 scheduled jobs).
- SLA timers or escalation.
- Reassigning while in a given state beyond what `ticket-assignment.md` specifies.

## State machine

The initial status on creation is `pending`. Legal transitions:

| From          | To            | Trigger                   | Actor               |
| ------------- | ------------- | ------------------------- | ------------------- |
| `pending`     | `in_progress` | assignment                | `agent` / `admin`   |
| `pending`     | `cancelled`   | cancel                    | requester           |
| `in_progress` | `resolved`    | mark resolved             | `agent` / `admin`   |
| `in_progress` | `cancelled`   | cancel                    | requester           |
| `resolved`    | `closed`      | confirm resolution        | requester           |
| `resolved`    | `in_progress` | reopen                    | requester           |
| `closed`      | —             | terminal                  | —                   |
| `cancelled`   | —             | terminal                  | —                   |

Rules:

- `closed` and `cancelled` are terminal; no transition may originate from them.
- `resolved → in_progress` (reopen) only allows a requester to push back an unsatisfactory resolution.
- `handler` is required to reach `resolved`; resolving an unassigned ticket is rejected (see `ticket-assignment.md`).

## Decisions

| Topic | Decision | Rationale |
| ----- | -------- | --------- |
| Transition source of truth | A single `ALLOWED_TRANSITIONS` map keyed by `from` status | One place to read/change the machine; trivial to test exhaustively |
| Illegal transition | `400 INVALID_STATE_TRANSITION` | Client can correct; distinct from `TICKET_NOT_FOUND` |
| Timeline | Append-only `ticket_events`, never updated or deleted | Auditability; mirrors the roadmap's immutable-timeline requirement |
| Timestamps | `resolved_at` set on `→ resolved`; `closed_at` on `→ closed` | Enables resolution-time reporting later |
| Requester cancel of `in_progress` | Allowed | Decision recorded here (was open in the roadmap); cancelling in-flight work is legitimate |
| Auto-close | Deferred to Phase 3 | Needs a scheduler; the `resolved → closed` transition remains available to requesters manually |

## API contract

A single transition endpoint. It also records the timeline row atomically with the status change.

### POST /api/tickets/:id/transition

Request body:

| Field   | Type   | Validation                            |
| ------- | ------ | ------------------------------------- |
| `to`    | enum   | one of `in_progress`/`resolved`/`closed`/`cancelled` |

The current status is read from the ticket; the `from` is implicit. Access is role-gated per transition:

| Transition | Allowed roles |
| ---------- | ------------- |
| `→ in_progress` | `agent`, `admin` (assignment; also see `ticket-assignment.md`) |
| `→ resolved` | `agent`, `admin` |
| `→ cancelled` | the requester (or `admin`) |
| `→ closed` | the requester (or `admin`) |
| `→ in_progress` from `resolved` (reopen) | the requester (or `admin`) |

Success `200` — `data`: the updated ticket.

Errors: `400 VALIDATION_ERROR`; `400 INVALID_STATE_TRANSITION`; `404 TICKET_NOT_FOUND`; `403 FORBIDDEN` (role not allowed for that transition).

## Data model

### `ticket_events`

| Column        | Type        | Null | Default   | Constraints / notes                     |
| ------------- | ----------- | ---- | --------- | --------------------------------------- |
| `id`          | uuid        | no   | uuid      | PK                                      |
| `ticket_id`   | uuid        | no   | —         | FK → `tickets.id` ON DELETE CASCADE, indexed |
| `actor_id`    | uuid        | no   | —         | FK → `users.id`                         |
| `from_status` | ticket_status | no | —        | status before the transition            |
| `to_status`   | ticket_status | no | —        | status after the transition             |
| `created_at`  | timestamptz | no   | `now()`   |                                         |

The `tickets` table gains no new columns beyond those in `tickets-crud.md` (`resolved_at`/`closed_at` already exist). This is part of the second migration.

## Error codes

| Code                      | HTTP | Used by                    |
| ------------------------- | ---- | -------------------------- |
| `INVALID_STATE_TRANSITION`| 400  | illegal `from → to`        |

`FORBIDDEN` (403) is reused for role-gated transitions.

## Architecture mapping

| Path | Responsibility |
| ---- | -------------- |
| `src/routes/tickets.ts` (+ `.spec.ts`) | `transition` route + OpenAPI |
| `src/schemas/ticket.ts` | transition request/response schemas |
| `src/services/ticket-state-machine.ts` (+ `.spec.ts`) | `ALLOWED_TRANSITIONS`, validation, timeline + status change |
| `src/repositories/ticket-repository.ts` | `transition` method (atomic status + event insert) |
| `src/db/schema.ts` | `ticket_events` table |

## Testing strategy

Colocated unit tests only. The state machine is tested exhaustively: every legal transition succeeds, every illegal transition (including both terminal states) returns `INVALID_STATE_TRANSITION`. Route tests cover role gating per transition and the timeline row being written.

## Acceptance criteria

- Every legal transition works and every illegal one returns `INVALID_STATE_TRANSITION`.
- Terminal states reject all further transitions.
- `resolved_at`/`closed_at` are set on their transitions.
- Each transition writes exactly one immutable `ticket_events` row.
- Quality gates pass.

## Open questions

- Whether `admin` may also cancel/close any ticket (currently allowed for operational flexibility).
- Whether reopening should require a reason — deferred; the transition is unconditional for now.
