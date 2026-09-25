# Login Protection

Module: `module-auth-users` · Batch: Phase 1 · Related: `login.md`, `rbac.md`, `user-management.md`, `common/api-response-comment.md`

## Status

Draft — awaiting review. No implementation yet.

## Background

`login.md` implements credential verification but performs no throttling. This spec adds brute-force protection around the login endpoint: per-account failure lockout and per-IP failure rate limiting. It is the failure-path hardening layered on top of `login.md`'s existing login flow.

## Goals

- Account lockout after a configurable number of consecutive failures.
- IP-based failure rate limiting within a sliding window.
- Success clears the account's failure streak; failures accumulate it.
- Configurable thresholds via environment variables.
- A response shape that does not reveal whether the lockout is account- or IP-based in a way an attacker can exploit (message stays generic where reasonable).

## Non-goals

- Distributed rate limiting (Redis/multi-instance) — the in-memory store is documented as single-instance only.
- CAPTCHA, two-factor, IP reputation, or account recovery.
- Protecting endpoints other than login (refresh, etc. remain as in `login.md`).

## Decisions

| Topic          | Decision                                                                                                                                         | Rationale                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Store          | In-memory `Map` keyed by username (account) and IP                                                                                               | Single-instance deployment; hermetic tests; zero new dependencies    |
| Sliding window | Fixed-size window per attempt (simplified); expired entries evicted on access                                                                    | Keeps memory bounded without a background timer                      |
| Lockout model  | After `N` consecutive failures, the account is locked for `L` seconds; a further attempt before expiry extends nothing (lockout runs its course) | Predictable and simple                                               |
| IP limit       | At most `X` failures from one IP within `W` seconds                                                                                              | Independent of account; catches username-spraying                    |
| Client IP      | Read from `x-forwarded-for` (first entry); fall back to a constant `'local'`                                                                     | No trusted proxy in this deployment; keeps tests deterministic       |
| Success        | A successful login resets the account's failure streak (IP failures are not cleared — they stay windowed)                                        | Prevents an attacker from laundering failures through a good account |
| Error codes    | `AUTH_ACCOUNT_LOCKED` (423) and `AUTH_RATE_LIMITED` (429)                                                                                        | Machine-readable and distinct from `AUTH_INVALID_CREDENTIALS`        |
| Placement      | Enforced in the login route, wrapping `authService.login`; the tracker is injected                                                               | Keeps `auth.ts` service unchanged; protection is a route concern     |

## Environment variables

| Variable                  | Default | Meaning                                      |
| ------------------------- | ------- | -------------------------------------------- |
| `AUTH_MAX_LOGIN_FAILURES` | `5`     | Consecutive failures before an account locks |
| `AUTH_LOCKOUT_SECONDS`    | `900`   | Lockout duration after the threshold is hit  |
| `AUTH_IP_FAILURE_LIMIT`   | `20`    | Max failures per IP in the window            |
| `AUTH_IP_WINDOW_SECONDS`  | `900`   | IP failure window length                     |

All are positive integers validated by the existing env schema; `AUTH_MAX_LOGIN_FAILURES` and `AUTH_IP_FAILURE_LIMIT` must be `>= 1`.

## API contract

No new endpoints. `POST /api/auth/login` gains two failure responses on top of those in `login.md`:

| Status | Code                  | When                                                                                          |
| ------ | --------------------- | --------------------------------------------------------------------------------------------- |
| 423    | `AUTH_ACCOUNT_LOCKED` | The account is currently locked (failure streak at/over threshold, within the lockout window) |
| 429    | `AUTH_RATE_LIMITED`   | The IP has exceeded its failure limit in the window                                           |

Ordering: IP rate limit is checked first (cheapest), then account lockout, then credential verification. `AUTH_ACCOUNT_LOCKED` uses a generic message (`Account temporarily locked`) that does not confirm the username exists.

## Tracker interface

```ts
interface LoginAttemptTracker {
  assertAllowed(ip: string, username: string): void // throws AUTH_RATE_LIMITED / AUTH_ACCOUNT_LOCKED
  recordFailure(ip: string, username: string): void
  recordSuccess(username: string): void // clears the account streak
}
```

`createMemoryLoginAttemptTracker(env)` is the default. The route catches credential failures and calls `recordFailure`; on success it calls `recordSuccess`.

## Architecture mapping

| Path                                                              | Responsibility                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/services/login-protection.ts` (+ `login-protection.spec.ts`) | `LoginAttemptTracker` + memory implementation                |
| `src/routes/auth.ts`                                              | Wrap `login` with the tracker (injected dependency)          |
| `src/config/env.ts`                                               | Four new variables                                           |
| `src/lib/errors.ts`                                               | `accountLockedError()` and `rateLimitedError()` constructors |

## Testing strategy

Colocated unit tests only (no E2E; see AGENTS.md).

Tracker (unit, fake clock or injected `now`): failures below threshold pass; reaching threshold locks; lockout expires; success resets streak; IP limit trips independently; expired entries are evicted.

Route (`app.request` + fake repos + injected tracker): correct order (IP → account → credentials); locked account returns 423; rate-limited IP returns 429; successful login resets the streak; failures accumulate.

## Acceptance criteria

- The login endpoint returns 423/429 as specified and never reveals whether a locked account exists.
- Thresholds are configurable and validated at startup.
- The tracker works with an injectable clock for deterministic tests.
- No new dependency or migration.
- Quality gates (format, lint, typecheck, unit tests, build) pass.

## Open questions

- Moving the tracker to Redis if multi-instance deployment ever arrives — deferred.
- Whether refresh endpoints need throttling too — deferred; login is the brute-force surface.
