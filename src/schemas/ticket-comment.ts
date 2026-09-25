import { z } from '@hono/zod-openapi'

import { failureEnvelopeSchema, successEnvelopeSchema } from './envelope.ts'

export const publicCommentSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  authorId: z.string(),
  body: z.string(),
  kind: z.enum(['public', 'internal']),
  createdAt: z.iso.datetime(),
})

export const createCommentRequestSchema = z.object({
  body: z.string().min(1).max(5000),
  kind: z.enum(['public', 'internal']).optional(),
})

export const commentResponseSchema = successEnvelopeSchema(publicCommentSchema)

export const commentListResponseSchema = successEnvelopeSchema(z.array(publicCommentSchema))

export const commentFailureResponseSchema = failureEnvelopeSchema
