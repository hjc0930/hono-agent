# 0002: Ticket System Roadmap

## Status

Planned. This document is the foundational plan; every phase is delivered by its own module specifications before any code is written. Their file organization is defined in "Module specification organization" below.

## Background

The project baseline (0001) is complete. The product direction is now a small-scale traditional business system: a helpdesk ticket system delivered as an admin backend. The earlier exploratory direction of AI endpoint management is dropped.

## Goals

- Grow the baseline into a ticket system backend with three user roles: `admin`, `agent` (handler), and `user` (requester).
- Deliver in phases: authentication first, then the ticket MVP, then optional advanced features.
- Reuse baseline conventions throughout: `data`/`meta` envelopes, stable error codes, OpenAPI contracts, colocated tests.

## Non-goals

- Payments, third-party integrations, multi-tenancy.
- Real-time chat (WebSocket) or in-app live conversations.
- AI/LLM features of any kind.
- Custom fields or workflow designers (deferred; see Phase 3).

## Roles

| Role    | Responsibilities                                                                   |
| ------- | ---------------------------------------------------------------------------------- |
| `user`  | Submit tickets, reply, confirm resolution, cancel, reopen, rate.                   |
| `agent` | Claim or handle assigned tickets, reply publicly, add internal notes, resolve.     |
| `admin` | Everything `agent` can do, plus user/category management, assignment, and reports. |

## Phase 1 — Authentication and user management

Delivered by a dedicated module specification.

- Credential login and logout; passwords hashed with a verified algorithm (bcrypt or argon2).
- Token strategy: JWT access + refresh tokens, or server sessions — decided in the Phase 1 module specification.
- User management (admin): create, update, list, enable/disable, reset password.
- RBAC middleware enforcing route-level role checks for the three roles.
- Login rate limiting against brute force.
- This phase activates the deferred Drizzle/PostgreSQL wiring and introduces the first migrations.

## Phase 2 — Ticket MVP

Delivered by a dedicated module specification.

Features:

- Create ticket: title, description, category, priority (`low`/`medium`/`high`/`urgent`).
- Paginated ticket list with filters: status, category, priority, requester, handler, time range, and keyword search; pagination follows the baseline `meta` convention.
- Ticket detail.
- Assignment: manual assignment by admin (self-claim by agents is a later option).
- Comments with visibility: `public` replies (requester-visible) and `internal` notes (agents/admin only).
- Immutable state-change timeline (`ticket_events`): who changed what, when, from which status to which.

State machine — every transition is validated in the service layer; illegal transitions return a stable error code:

| From          | To            | Trigger                 | Actor         |
| ------------- | ------------- | ----------------------- | ------------- |
| `pending`     | `in_progress` | Claim or assignment     | agent / admin |
| `pending`     | `cancelled`   | Cancel                  | requester     |
| `in_progress` | `resolved`    | Mark resolved           | agent / admin |
| `in_progress` | `cancelled`   | Cancel (open decision)  | requester     |
| `resolved`    | `closed`      | Confirm resolution      | requester     |
| `resolved`    | `closed`      | Auto-close after N days | system        |
| `resolved`    | `in_progress` | Reopen                  | requester     |
| `closed`      | —             | Terminal state          | —             |
| `cancelled`   | —             | Terminal state          | —             |

## Phase 3 — Advanced features

Each item gets its own module specification when selected. Priority order:

1. Notifications on state change (in-app message first, email optional).
2. Reporting: ticket volume trends, average resolution time, distribution by category/handler/priority.
3. SLA targets by priority plus scheduled jobs (SLA inspection, auto-close of resolved tickets).
4. Satisfaction rating before close.
5. Attachments on tickets and comments.
6. Custom fields and tags (largest scope; consider last).

## Data model sketch

| Table               | Key columns                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `users`             | Credentials, role (`admin`/`agent`/`user`), status (from Phase 1)                                   |
| `tickets`           | Title, description, category_id, priority, status, requester_id, handler_id, resolved_at, closed_at |
| `ticket_comments`   | ticket_id, author_id, body, kind (`public`/`internal`)                                              |
| `ticket_events`     | ticket_id, actor_id, action, from_status, to_status, created_at                                     |
| `ticket_categories` | Name, enabled                                                                                       |

## API and error conventions

- All responses follow the unified envelope in `spec/common/api-response-comment.md`; module specs reference that file instead of restating envelope fields.
- Illegal state transitions return `INVALID_STATE_TRANSITION`; permission denials return a stable authorization error code.
- Every public route change updates the OpenAPI contract and its tests in the same change.

## Testing strategy

- Colocated unit tests plus the E2E suite under `test/`; tests stay hermetic (no live database required unless a future specification introduces one deliberately).
- The state machine must be tested for every legal transition and a representative set of illegal ones.
- Comment visibility must be tested: requesters cannot read internal notes.

## Open decisions

- JWT versus sessions for Phase 1 authentication.
- Password hashing algorithm choice.
- Whether requesters may cancel `in_progress` tickets.
- The auto-close window N for resolved tickets.
- Phase ordering inside Phase 3 may change with product needs.

## Module specification organization

Decided on 2026-09-24:

- Each delivered batch gets one folder under `spec/`: `module-auth-users/` for Phase 1 and `module-tickets/` for Phase 2.
- Inside a batch folder, each functional module gets its own spec file named after the function without a numeric prefix, for example `login.md`, `rbac.md`, `tickets-crud.md`. Spec files are added when they are drafted.
- Phase 3 stays as a plan in this document; no folder is pre-created. A folder and spec files are added only when a Phase 3 feature is initiated.
- Project-wide common rules live in `spec/common/` instead of being duplicated across module specs.
- Top-level specs (`0001`, `0002`, ...) keep numeric prefixes and record project-level decisions and direction changes.
- These rules are canonical in `AGENTS.md` under "Specification Organization"; keep both documents in sync.
