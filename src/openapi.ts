import { swaggerUI } from '@hono/swagger-ui'
import type { OpenAPIHono } from '@hono/zod-openapi'

import type { AppVariables } from './types.ts'

export const registerOpenApi = (app: OpenAPIHono<{ Variables: AppVariables }>) => {
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  })
  app.doc('/openapi.json', {
    info: {
      title: 'Hono Agent API',
      version: '0.1.0',
    },
    openapi: '3.1.0',
  })
  app.get('/docs', swaggerUI({ url: '/openapi.json' }))
}
