# Authentication Conventions

Common rules shared by every module. Issuance is specified in `module-auth-users/login.md`; guard semantics in `module-auth-users/rbac.md`. Keep changes here in sync with those documents.

## Token presentation

- Protected routes authenticate with `Authorization: Bearer <accessToken>`.
- The access token is a JWT (HS256) with claims `sub` (user id), `role`, `iat`, `exp`.
- Access tokens are short-lived; clients obtain new ones via the refresh endpoint. Refresh tokens are opaque, rotated on every refresh, revocable, and stored server-side only as hashes.

## Status codes and error codes

- `401 UNAUTHORIZED` — missing, malformed, or expired access token; the client should refresh or re-login.
- `403 FORBIDDEN` — valid token, but the role is insufficient for the route.
- Auth endpoints live under `/api/auth/*`; other modules must not invent alternative auth schemes.

## Role staleness

- The `role` claim may be up to one access-token TTL (default 15 minutes) out of date after an admin changes a user's role. Modules must not treat the claim as instantly revocable; if a decision must be immediate, re-read the role from the database.
