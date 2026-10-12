# Ticket Workspace Web Application

Module: `module-webapp` · Related: `webapp-baseline.md`, `module-auth-users/login.md`, `module-auth-users/rbac.md`, `module-auth-users/user-management.md`, `module-tickets/tickets-crud.md`, `module-tickets/ticket-assignment.md`, `module-tickets/ticket-categories.md`, `module-tickets/ticket-comments.md`, `module-tickets/ticket-state-machine.md`

## Status

In progress.

## Goal

Provide a browser-based interface for the existing ticket system. The client is a React single-page application that calls the Hono REST API directly through same-origin `/api/*` requests. The backend remains the authority for authentication, authorization, validation, and workflow rules.

## Non-goals

- Server-side rendering, a frontend backend, or a separate persistence layer.
- Features not present in the backend API, including notifications, reporting, attachments, ratings, and real-time updates.
- User registration, self-service password changes, or password reset emails.
- Client-side enforcement as a substitute for server authorization.

## Routes and access

| Browser route  | Access                                       | Purpose                                                                          |
| -------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| `/login`       | Public                                       | Credential login.                                                                |
| `/tickets`     | Authenticated                                | Paginated ticket queue/list with filters. Requesters see only their own tickets. |
| `/tickets/new` | Authenticated                                | Create a ticket; agents and admins may optionally file on behalf of a requester. |
| `/tickets/:id` | Authenticated                                | Ticket details, allowed actions, and chronological comments.                     |
| `/users`       | Admin                                        | Search, browse, create, update, enable/disable, and reset passwords for users.   |
| `/categories`  | Admin for changes; authenticated for reading | Browse categories and manage category name, description, and enabled state.      |

Unauthenticated visits to protected routes go to `/login`; after successful login the user returns to the intended route, or `/tickets` when there is no intended route. Unknown routes show a not-found page. Navigation items may be hidden by role for clarity, but direct navigation must still rely on API authorization.

## Application shell and shared states

- Authenticated pages share a workspace shell with the product name, primary navigation, current user's display name/role when available, and a logout action.
- Show the ticket navigation to all authenticated roles. Show user management only to admins. Categories remain readable by all authenticated roles; only admins receive category mutation controls.
- Resolve the current session through `/api/auth/me`; do not treat a locally cached role or display name as proof of authorization.
- Every data page and mutation has loading, empty, success, and recoverable error states. Errors use safe envelope messages and never expose stack traces.
- On narrow screens, navigation can collapse, tables may become readable cards or scrollable regions, and ticket actions remain reachable.
- Use accessible semantic headings, labelled inputs, associated validation messages, keyboard-operable controls, and visible focus states.

## Page requirements

### Login — `/login`

- Provide username and password fields and a submit action. Apply the backend constraints: username is 3–32 lowercase letters, digits, `_` or `-`; password is 8–128 characters.
- Disable duplicate submission while the request is pending. Present validation and authentication failures next to the form without revealing whether a username exists.
- On success, load the current user and return to the originally requested protected URL, or `/tickets` if none was recorded.
- Disabled accounts and rate-limit/lock responses receive a safe, actionable message; do not log credentials or tokens.
- User registration, password recovery email, and self-service password change are outside this feature.

### Ticket list — `/tickets`

- Fetch `/api/tickets` with `page`, `pageSize` (default 1 and 20), and supported filters: `status`, `priority`, `categoryId`, `requesterId`, `handlerId`, `createdFrom`, `createdTo`, and `keyword`.
- Display at least the ticket title, status, priority, category, requester, handler, and creation time, with a link to the detail page. Keep sorting consistent with the API's newest-first ordering.
- Read pagination totals from response `meta`; provide previous/next or equivalent page controls and reset to page 1 when filters change.
- Serialize active filters and pagination into the URL query string and restore them on reload/back navigation. Do not put credentials, tokens, or other secrets in the URL.
- Requesters see only their own tickets; ignore or omit requester filters that could imply broader visibility. The API remains authoritative for visibility. Admins may select people by display name; agents may enter requester/handler UUIDs because the user list API is admin-only.
- Include clear-filter, loading, empty-result, retryable-error, and access-denied states.

### Create ticket — `/tickets/new`

- Load enabled categories and require a category selection. Provide title (1–200 characters), description (1–5000 characters), and priority (`low`, `medium`, `high`, `urgent`; default `medium`).
- For `user`, omit requester selection and let the API assign the current user. Admins may select an optional requester using the admin-only user list API. Agents may optionally enter a requester UUID because `/api/users` is admin-only; a requester lookup endpoint for agents is not currently specified. Do not allow a `user` to impersonate another requester.
- Keep field-level validation errors on the form. On success, show confirmation and navigate to the created ticket detail.
- Handle a category becoming disabled or otherwise invalid between form load and submit by retaining the form and showing the API error.

### Ticket detail — `/tickets/:id`

- Load the ticket and its comments. Present title, description, category, priority, status, requester, handler, and available timestamps.
- Offer only status actions valid for the current role and status, as defined by `ticket-state-machine.md`. In particular, closed and cancelled tickets are terminal. Server responses remain authoritative; handle `400` business errors and `403`/`404` without losing the page context.
- Provide admin-only assignment/reassignment to an active `agent` or `admin`. Assignment of a pending ticket moves it to `in_progress`; reassignment of an in-progress ticket leaves its status unchanged. Terminal-ticket assignment errors are shown in context.
- Render comments oldest first. Mark internal notes distinctly for agents/admins; requesters must never receive or see them. Requesters can submit public comments only; agents/admins can choose public or internal. Comment body is required and limited to 5000 characters.
- Comments are append-only: no edit or delete controls. After a successful comment, transition, or assignment, refresh affected detail and list queries so status and handler remain current.
- The API does not currently expose a ticket-event listing endpoint. Do not present an event timeline as available data in this scope.

### User management — `/users`

- Admin-only page backed by `/api/users` and its documented create, update, and reset-password routes.
- Provide paginated browse/search with the API-supported `page`, `pageSize`, `role`, `status`, and `keyword` filters. Show username, display name, role, status, and relevant timestamps returned by the API.
- Create users with username, password, optional display name, and role (`admin`, `agent`, `user`). Validate username and password constraints before submission and show duplicate-name or validation errors inline.
- Edit display name, role, and status. Confirm disabling an account and explain that the account will no longer be able to log in. Do not physically delete users.
- Reset a user's password through the admin reset endpoint; confirm the account-impacting action, collect the new password, and never display or log it after submission.
- This page does not provide session management, registration, or self-service password changes.

### Categories — `/categories`

- Use `/api/ticket-categories` to show paginated categories with `page`, `pageSize`, `enabled`, and `keyword` filters. Authenticated roles can read; only admins can create or update.
- Show name, description, and enabled state. Admins can create a category with a required name (1–64 characters) and optional description (up to 255 characters), and edit name, description, or enabled state.
- Confirm disabling a category and explain that it remains available on historical tickets but cannot be selected for new tickets. Categories cannot be physically deleted.
- Present duplicate-name, missing-category, and validation errors in context. Category selection on ticket creation must use enabled categories only.

### Not found — unmatched routes

- Render a not-found state with a link back to `/tickets` for authenticated users or `/login` for unauthenticated users.

## Role and workflow matrix

| Capability | `user` | `agent` | `admin` |
| --- | --- | --- | --- |
| List/read tickets | Own tickets only | All tickets | All tickets |
| Create ticket | As self | As self or on behalf of a requester | As self or on behalf of a requester |
| Public comment | Own tickets | Any ticket | Any ticket |
| Internal comment | No | Any ticket | Any ticket |
| Assign/reassign handler | No | No (self-claim is not in scope) | Yes, to an active agent/admin |
| Read categories | Yes | Yes | Yes |
| Create/update categories | No | No | Yes |
| Manage users | No | No | Yes |

Status controls must follow `ticket-state-machine.md`; this matrix does not grant actions that the state machine disallows.

## Role behavior

- `user`: may create tickets and see only tickets they requested. May add public comments, cancel eligible tickets, close a resolved ticket, and reopen a resolved ticket. Never sees internal comments or admin-management navigation.
- `agent`: may see all tickets, create tickets, add public comments or internal notes, and perform the transitions allowed by the ticket state machine.
- `admin`: has agent capabilities and may assign/reassign tickets, manage users, and create/update categories.
- The API response and backend role guard are authoritative. The frontend must not infer access from a username, display name, or editable form state.

## Ticket list and detail

The list supports the backend filters `status`, `priority`, `categoryId`, `requesterId`, `handlerId`, `createdFrom`, `createdTo`, and `keyword`, plus `page` and `pageSize`. Lists default to page 1 and 20 items; the UI reads `meta` from the response for total count and page navigation. Requesters cannot use filters to broaden their visibility.

The detail view shows ticket title, description, category, priority, status, requester, handler, and timestamps. Available status actions follow `ticket-state-machine.md`; assignment is a separate admin-only action defined by `ticket-assignment.md`. Disable or omit actions that are not applicable to the current status, while still handling server rejection as the final authority.

Comments appear in chronological order. Users can post public comments only; agents and admins can choose public or internal comments. Clearly distinguish internal notes in the UI. After a comment or ticket mutation succeeds, refresh the affected detail and list queries so displayed state matches the server.

## API behavior

- Use `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, and `/api/auth/me` for the auth lifecycle.
- Use `/api/tickets`, `/api/tickets/:id`, `/api/tickets/:id/transition`, `/api/tickets/:id/assign`, and `/api/tickets/:id/comments` for ticket operations.
- Use `/api/users` and its documented subroutes for admin user management; use `/api/ticket-categories` and its documented subroutes for category management and selection.
- Send authenticated requests with `Authorization: Bearer <accessToken>` as required by the backend.
- Parse the shared response envelope from `common/api-response-comment.md`. Show safe top-level `message` or field-level `errors.message` to the user; never render or log `errors.stack`.
- Treat `401` as an expired or invalid session and attempt at most one token refresh before returning the user to login. Treat `403` as an access denial; `400` validation/business errors remain on the current form or view and are presented in context.
- Keep API requests same-origin so development and deployment can route `/api/*` to the Hono service without browser CORS configuration.

## Session security decision

The backend currently returns both access and refresh tokens in the login response body and does not expose an HttpOnly-cookie flow. Before implementing login persistence, decide how the SPA stores tokens across page reloads. Do not put tokens, passwords, or authorization headers in logs, URLs, analytics, or error reports. Clear cached user-specific data when logging out or changing accounts.

The current implementation keeps tokens in memory only and intentionally returns to `/login` after a page reload. This is an interim non-persistent session behavior, not a decision about cross-reload persistence. The persistence choice remains **open** and is a prerequisite for implementing persistent login. Until it is decided, do not encode localStorage, sessionStorage, or another persistence mechanism as an accepted product requirement. On logout, clear all in-memory/cached user-specific data and return to `/login`.

## Interaction and accessibility

- Provide loading, empty, error, and success feedback for each data view and mutation.
- Keep list filters and pagination represented in the URL query string so views can be refreshed and shared where access permits.
- Use semantic headings, labels, buttons, links, and table headers; associate validation messages with their fields and preserve keyboard operation.
- Confirm destructive or account-impacting admin actions, such as disabling a user or category, and explain the result before submission.
- Use responsive layouts that keep ticket content, status, and primary actions usable on narrow screens.
- Do not silently discard unsaved form input when a recoverable validation or business error occurs.
- After account changes that affect the current session, treat the next API response as authoritative and handle a resulting `401`/`403` through the shared session/access-denied flow.

## Unit test expectations

- Add colocated unit/component tests for session transitions, role-based navigation visibility, ticket filter serialization, envelope/error parsing, and the state-dependent action list.
- Test requester visibility assumptions and internal-comment presentation with representative role fixtures. Backend authorization remains covered by backend tests.
- Keep tests hermetic; do not require a running API, database, network access, or real credentials.

## Acceptance criteria

- Each route above renders the correct public, authenticated, or admin state.
- Login return navigation, protected-route handling, logout cleanup, and not-found behavior follow this specification.
- Ticket list filters, URL serialization, pagination, ticket creation, detail actions, assignment, and comments follow their respective backend contracts.
- User and category management expose only the documented admin mutations and handle confirmation and API validation errors.
- Ticket list and detail operations use the documented backend endpoints and response envelope.
- Role-aware UI reflects the backend contract and never exposes internal comments to a requester.
- Ticket mutations refresh visible server state and surface safe validation and authorization errors.
- Token storage policy is recorded before login persistence is implemented.

## Open decisions

- Select and document a token persistence policy before implementing login persistence; the backend currently has no HttpOnly-cookie contract.
- The API does not expose ticket-event history, so a full status/assignment timeline is deferred until a read endpoint is specified.
- Comment pagination and notifications are deferred; the current comments endpoint returns the complete chronological thread.
