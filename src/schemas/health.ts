import { z } from '@hono/zod-openapi'

import { successEnvelopeSchema } from './envelope.ts'

export const healthResponseSchema = successEnvelopeSchema(
  z.object({
    status: z.literal('ok'),
  }),
)
