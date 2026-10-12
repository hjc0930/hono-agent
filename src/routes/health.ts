import { createRoute } from '@hono/zod-openapi'

import { healthResponseSchema } from '../schemas/health.ts'

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  security: [],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: healthResponseSchema,
        },
      },
      description: 'OK: the HTTP service is available; data.status is always ok.',
    },
  },
  summary: 'Check service liveness',
  description:
    'Public endpoint; no authentication is required. data.status=ok indicates that the HTTP service can respond. It does not connect to or probe the database and does not indicate external dependency health. Suitable for a liveness probe.',
  tags: ['System'],
})
