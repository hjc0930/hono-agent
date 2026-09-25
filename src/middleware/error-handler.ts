import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'

import { AppError } from '../lib/errors.ts'
import { logger } from '../lib/logger.ts'
import { failureEnvelope } from '../lib/response.ts'
import type { AppVariables } from '../types.ts'

const requestPath = (context: Parameters<ErrorHandler<{ Variables: AppVariables }>>[1]): string =>
  new URL(context.req.url).pathname

export const errorHandler: ErrorHandler<{ Variables: AppVariables }> = (error, context) => {
  const path = requestPath(context)

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => {
      const field = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)'
      return `${field}: ${issue.message}`
    })
    return context.json(
      failureEnvelope({
        path,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errorDetails: details,
        error,
      }),
      400 as ContentfulStatusCode,
    )
  }

  if (error instanceof AppError) {
    return context.json(
      failureEnvelope({
        path,
        code: error.code,
        message: error.message,
        errorDetails: error.details,
        error,
      }),
      error.status,
    )
  }

  logger.error({ err: error }, 'unhandled request error')
  return context.json(
    failureEnvelope({
      path,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      error,
    }),
    500 as ContentfulStatusCode,
  )
}
