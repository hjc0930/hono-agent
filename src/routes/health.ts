import { createRoute } from '@hono/zod-openapi'

import { healthResponseSchema } from '../schemas/health.ts'

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: healthResponseSchema,
        },
      },
      description: 'Service is available',
    },
  },
  summary: 'Health check',
  tags: ['System'],
})
