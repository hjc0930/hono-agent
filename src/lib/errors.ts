import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFoundError = () => new AppError(404, 'NOT_FOUND', 'Route not found')

export const unauthorizedError = () => new AppError(401, 'UNAUTHORIZED', 'Authentication required')

export const forbiddenError = () => new AppError(403, 'FORBIDDEN', 'Insufficient permissions')

export const accountLockedError = () =>
  new AppError(423, 'AUTH_ACCOUNT_LOCKED', 'Account temporarily locked')

export const rateLimitedError = () => new AppError(429, 'AUTH_RATE_LIMITED', 'Too many requests')

export const userNotFoundError = () => new AppError(404, 'USER_NOT_FOUND', 'User not found')

export const usernameTakenError = () =>
  new AppError(409, 'USERNAME_TAKEN', 'Username is already taken')

export const selfModificationForbiddenError = () =>
  new AppError(403, 'SELF_MODIFICATION_FORBIDDEN', 'Cannot modify your own role or status')
