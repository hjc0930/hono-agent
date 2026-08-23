import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { AppError } from '../lib/errors.ts'
import { logger } from '../lib/logger.ts'
import type { AppVariables } from '../types.ts'

type ErrorBody = {
  error: {
    code: string
    details?: unknown
    message: string
    requestId: string
  }
}

const bodyFor = (error: AppError, requestId: string): ErrorBody => ({
  error: {
    code: error.code,
    ...(error.details === undefined ? {} : { details: error.details }),
    message: error.message,
    requestId,
  },
})

export const errorHandler: ErrorHandler<{ Variables: AppVariables }> = (error, context) => {
  const requestId = context.get('requestId') ?? 'unknown'

  if (error instanceof AppError) {
    return context.json(bodyFor(error, requestId), error.status)
  }

  logger.error({ code: 'INTERNAL_ERROR', requestId }, 'unhandled request error')
  return context.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId,
      },
    },
    500 as ContentfulStatusCode,
  )
}
