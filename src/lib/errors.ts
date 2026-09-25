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
