import { z } from '@hono/zod-openapi'

import {
  failureEnvelopeSchema,
  paginatedEnvelopeSchema,
  successEnvelopeSchema,
} from './envelope.ts'
import { paginationQuerySchema } from './pagination.ts'

export const ticketCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
})

export const createTicketCategoryRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(255).optional(),
})

export const ticketCategoryListQuerySchema = paginationQuerySchema.extend({
  enabled: z.coerce.boolean().optional(),
  keyword: z.string().trim().min(1).optional(),
})

export const updateTicketCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    description: z.string().trim().max(255).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  })

export const ticketCategoryResponseSchema = successEnvelopeSchema(ticketCategorySchema)

export const ticketCategoryListResponseSchema = paginatedEnvelopeSchema(ticketCategorySchema)

export const ticketCategoryFailureResponseSchema = failureEnvelopeSchema
