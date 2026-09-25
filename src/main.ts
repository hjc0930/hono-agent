import { OpenAPIHono } from '@hono/zod-openapi'

import { AppError, notFoundError } from './lib/errors.ts'
import { successEnvelope } from './lib/response.ts'
import { errorHandler } from './middleware/error-handler.ts'
import { requestContext } from './middleware/request-context.ts'
import { apiCors, securityHeaders } from './middleware/security.ts'
import { registerAuthRoutes, type AuthRouteDependencies } from './routes/auth.ts'
import { registerUserRoutes, type UserRouteDependencies } from './routes/users.ts'
import { healthRoute } from './routes/health.ts'
import { registerOpenApi } from './openapi.ts'
import type { AppVariables } from './types.ts'

export type AppDependencies = AuthRouteDependencies & UserRouteDependencies

export const createApp = (dependencies: AppDependencies = {}) => {
  // Route validation failures must surface as the common failure envelope, so the
  // default zod-openapi 400 body is replaced with a thrown AppError.
  const app = new OpenAPIHono<{ Variables: AppVariables }>({
    defaultHook: (result) => {
      if (result.success) return
      const details = result.error.issues.map((issue) => {
        const field = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)'
        return `${field}: ${issue.message}`
      })
      throw new AppError(400, 'VALIDATION_ERROR', 'Validation failed', details)
    },
  })

  app.use('*', requestContext)
  app.use('*', securityHeaders)
  app.use('/api/*', apiCors)
  app.onError(errorHandler)

  app.openapi(healthRoute, (context) =>
    context.json(
      successEnvelope({
        path: new URL(context.req.url).pathname,
        data: { status: 'ok' },
      }),
      200,
    ),
  )
  registerAuthRoutes(app, dependencies)
  registerUserRoutes(app, dependencies)
  registerOpenApi(app)
  app.notFound(() => {
    throw notFoundError()
  })

  return app
}

export const app = createApp()
