# Ticket Comments

Module: `module-tickets` · Batch: Phase 2 · Related: `tickets-crud.md`, `ticket-state-machine.md`, `module-auth-users/rbac.md`

## Status

Draft — awaiting review. No implementation yet.

## Background

Comments are the communication channel on a ticket. They come in two kinds: `public` replies (visible to the requester) and `internal` notes (visible only to agents/admins). This spec defines creation, listing, and the visibility rule that separates the two.

## Goals

- A `ticket_comments` table with body, author, kind, and timestamps.
- Requesters add `public` comments; agents/admins add `public` or `internal` comments.
- A list endpoint that applies the visibility rule: requesters never see `internal` comments, and only on their own tickets.

## Non-goals

- Editing or deleting comments (comments are immutable once posted).
- Rich text, attachments, or mentions.
- Email notifications on comment — deferred to Phase 3.

## Decisions

| Topic         | Decision                                                                                                    | Rationale                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Kinds         | `public` / `internal`                                                                                       | Mirrors the roadmap's public-reply vs internal-note split |
| Author access | `user` may post `public` only; `agent`/`admin` may post either                                              | Requesters never author internal notes                    |
| Visibility    | `internal` comments are hidden from the requester; a requester only ever lists comments on their own ticket | Enforces the two-channel model                            |
| Immutability  | Comments are append-only (no update/delete)                                                                 | Simpler audit trail; consistent with `ticket_events`      |
| Ordering      | `created_at` ascending                                                                                      | Chronological thread                                      |
| Body          | `max(5000)`, non-empty                                                                                      | Bounded plain text                                        |

## API contract

Both routes require `requireAuth`; the service enforces per-ticket visibility (a requester can only read comments on their own ticket).

### POST /api/tickets/:id/comments

Request body:

| Field  | Type   | Validation                                      |
| ------ | ------ | ----------------------------------------------- |
| `body` | string | `min(1)`, `max(5000)`                           |
| `kind` | enum   | optional, `public`/`internal`, default `public` |

A `user` role posting `kind: internal` is rejected.

Success `200` — `data`: the created comment:

```json
{
  "id": "uuid",
  "ticketId": "uuid",
  "authorId": "uuid",
  "body": "...",
  "kind": "public",
  "createdAt": "2026-09-25T08:30:00.000Z"
}
```

Errors: `400 VALIDATION_ERROR`; `403 FORBIDDEN` (user posting internal); `404 TICKET_NOT_FOUND`.

### GET /api/tickets/:id/comments

Lists comments in chronological order. For a `user`, only `public` comments on their own ticket are returned (and only if they own the ticket); for `agent`/`admin`, all comments are returned.

Success `200` — `data`: array of comments (no pagination in the MVP; the thread is expected to be small).

Errors: `404 TICKET_NOT_FOUND`; `403 FORBIDDEN` (user reading another's ticket).

## Data model

### `ticket_comments`

| Column       | Type         | Null | Default  | Constraints / notes                          |
| ------------ | ------------ | ---- | -------- | -------------------------------------------- |
| `id`         | uuid         | no   | uuid     | PK                                           |
| `ticket_id`  | uuid         | no   | —        | FK → `tickets.id` ON DELETE CASCADE, indexed |
| `author_id`  | uuid         | no   | —        | FK → `users.id`                              |
| `body`       | text         | no   | —        |                                              |
| `kind`       | comment_kind | no   | `public` | pgEnum `public`/`internal`                   |
| `created_at` | timestamptz  | no   | `now()`  |                                              |

One new enum: `comment_kind` (`public`, `internal`). Part of the second migration.

## Error codes

No new error codes; `FORBIDDEN` (403) and `TICKET_NOT_FOUND` (404) are reused.

## Architecture mapping

| Path                                            | Responsibility                                      |
| ----------------------------------------------- | --------------------------------------------------- |
| `src/routes/tickets.ts` (+ `.spec.ts`)          | comment routes + OpenAPI                            |
| `src/schemas/ticket-comment.ts`                 | Zod request/response schemas                        |
| `src/services/ticket-comment.ts` (+ `.spec.ts`) | Author/kind validation, visibility-filtered listing |
| `src/repositories/ticket-comment-repository.ts` | Drizzle implementation + interface                  |
| `src/db/schema.ts`                              | `ticket_comments` table + `comment_kind` enum       |

## Testing strategy

Colocated unit tests only. The visibility rule is tested explicitly: a requester never receives `internal` comments and cannot read another's ticket; agents/admins receive both kinds. Cover creation (public/internal, user blocked from internal) and listing order.

## Acceptance criteria

- The second migration creates `ticket_comments` and `comment_kind` exactly as specified.
- Requesters cannot post or read `internal` comments, and cannot read another's ticket.
- Comments are append-only and ordered chronologically.
- Quality gates pass.

## Open questions

- Pagination for comments — deferred until threads grow large.
- Whether `agent`/`admin` can comment on `closed`/`cancelled` tickets — currently allowed; may tighten later.
