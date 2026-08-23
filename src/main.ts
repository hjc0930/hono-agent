import { OpenAPIHono } from '@hono/zod-openapi'

import { notFoundError } from './lib/errors.ts'
import { errorHandler } from './middleware/error-handler.ts'
import { requestContext } from './middleware/request-context.ts'
import { apiCors, securityHeaders } from './middleware/security.ts'
import { registerOpenApi } from './openapi.ts'
import { healthRoute } from './routes/health.ts'
import type { AppVariables } from './types.ts'

export const createApp = () => {
  const app = new OpenAPIHono<{ Variables: AppVariables }>()

  app.use('*', requestContext)
  app.use('*', securityHeaders)
  app.use('/api/*', apiCors)
  app.onError(errorHandler)

  app.openapi(healthRoute, (context) => context.json({ data: { status: 'ok' } }, 200))
  registerOpenApi(app)
  app.notFound(() => {
    throw notFoundError()
  })

  return app
}

export const app = createApp()
