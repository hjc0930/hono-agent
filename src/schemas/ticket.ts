import { z } from '@hono/zod-openapi'

import {
  failureEnvelopeSchema,
  paginatedEnvelopeSchema,
  successEnvelopeSchema,
} from './envelope.ts'
import { paginationQuerySchema } from './pagination.ts'

export const prioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

export const statusSchema = z.enum(['pending', 'in_progress', 'resolved', 'closed', 'cancelled'])

export const publicTicketSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  categoryId: z.string(),
  priority: prioritySchema,
  status: statusSchema,
  requesterId: z.string(),
  handlerId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const createTicketRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().min(1).max(5000),
  categoryId: z.string().min(1),
  priority: prioritySchema.optional(),
  requesterId: z.string().min(1).optional(),
})

export const ticketListQuerySchema = paginationQuerySchema.extend({
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  categoryId: z.string().min(1).optional(),
  requesterId: z.string().min(1).optional(),
  handlerId: z.string().min(1).optional(),
  keyword: z.string().trim().min(1).optional(),
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional(),
})

export const transitionRequestSchema = z.object({
  to: z.enum(['in_progress', 'resolved', 'closed', 'cancelled']),
})

export const assignRequestSchema = z.object({
  handlerId: z.string().min(1),
})

export const ticketResponseSchema = successEnvelopeSchema(publicTicketSchema)

export const ticketListResponseSchema = paginatedEnvelopeSchema(publicTicketSchema)

export const ticketFailureResponseSchema = failureEnvelopeSchema
