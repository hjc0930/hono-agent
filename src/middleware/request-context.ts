import { randomUUID } from 'node:crypto'

import { createMiddleware } from 'hono/factory'

import { logger } from '../lib/logger.ts'
import type { AppVariables } from '../types.ts'

export const requestContext = createMiddleware<{ Variables: AppVariables }>(
  async (context, next) => {
    const providedRequestId = context.req.header('x-request-id')
    const requestId =
      providedRequestId && providedRequestId.length <= 128 ? providedRequestId : randomUUID()
    const startedAt = performance.now()

    context.set('requestId', requestId)
    context.header('x-request-id', requestId)

    await next()

    logger.info(
      {
        durationMs: Math.round(performance.now() - startedAt),
        method: context.req.method,
        path: new URL(context.req.url).pathname,
        requestId,
        status: context.res.status,
      },
      'request completed',
    )
  },
)
