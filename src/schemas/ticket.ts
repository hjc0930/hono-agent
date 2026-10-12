import { z } from '@hono/zod-openapi'

import {
  failureEnvelopeSchema,
  paginatedEnvelopeSchema,
  successEnvelopeSchema,
} from './envelope.ts'
import { paginationQuerySchema } from './pagination.ts'

export const prioritySchema = z
  .enum(['low', 'medium', 'high', 'urgent'])
  .openapi({ description: 'Priority: low, medium, high, or urgent.', example: 'medium' })

export const statusSchema = z
  .enum(['pending', 'in_progress', 'resolved', 'closed', 'cancelled'])
  .openapi({
    description:
      'Ticket status: pending (awaiting handling), in_progress (being handled), resolved, closed, or cancelled.',
    example: 'pending',
  })

export const publicTicketSchema = z.object({
  id: z.string().openapi({
    description: 'Unique resource ID.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
  title: z
    .string()
    .openapi({ description: 'Ticket title.', example: 'Cannot log in to the application' }),
  description: z.string().openapi({
    description: 'Description text.',
    example: 'Please investigate why I cannot log in.',
  }),
  categoryId: z.string().openapi({
    description: 'Ticket category ID. Creation requires an existing, enabled category.',
    example: '00000000-0000-4000-8000-000000000002',
  }),
  priority: prioritySchema.openapi({
    description: 'Priority: low, medium, high, or urgent.',
    example: 'medium',
  }),
  status: statusSchema.openapi({
    description:
      'Ticket status: pending (awaiting handling), in_progress (being handled), resolved, closed, or cancelled.',
    example: 'pending',
  }),
  requesterId: z.string().openapi({
    description:
      'Requester user ID. Defaults to the current user on creation; user cannot submit for another user and list queries always restrict user to their own ID.',
    example: '00000000-0000-4000-8000-000000000003',
  }),
  handlerId: z.string().nullable().openapi({
    description:
      'Handler user ID, or null when unassigned. Assignment requires an active agent/admin.',
    example: '00000000-0000-4000-8000-000000000004',
  }),
  createdAt: z.iso.datetime().openapi({
    description: 'Creation time in UTC ISO 8601 format.',
    example: '2026-10-12T08:30:00.000Z',
  }),
  updatedAt: z.iso.datetime().openapi({
    description: 'Last update time in UTC ISO 8601 format.',
    example: '2026-10-12T08:30:00.000Z',
  }),
})

export const createTicketRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).openapi({
    description: 'Ticket title, 1-200 characters after trimming.',
    example: 'Cannot log in to the application',
  }),
  description: z.string().min(1).max(5000).openapi({
    description: 'Description text, 1-5000 characters.',
    example: 'Please investigate why I cannot log in.',
  }),
  categoryId: z.string().min(1).openapi({
    description: 'Ticket category ID. Creation requires an existing, enabled category.',
    example: '00000000-0000-4000-8000-000000000002',
  }),
  priority: prioritySchema.optional().openapi({
    description:
      'Optional priority: low, medium, high, or urgent. Defaults to medium on creation; omitted list filters do not restrict priority.',
    example: 'medium',
  }),
  requesterId: z.string().min(1).optional().openapi({
    description:
      'Optional requester user ID. Defaults to the current user on creation; user cannot submit for another user and list queries always restrict user to their own ID.',
    example: '00000000-0000-4000-8000-000000000003',
  }),
})

export const ticketListQuerySchema = paginationQuerySchema.extend({
  status: statusSchema.optional().openapi({
    description:
      'Ticket status: pending (awaiting handling), in_progress (being handled), resolved, closed, or cancelled.',
    example: 'pending',
  }),
  priority: prioritySchema.optional().openapi({
    description:
      'Optional priority: low, medium, high, or urgent. Defaults to medium on creation; omitted list filters do not restrict priority.',
    example: 'medium',
  }),
  categoryId: z.string().min(1).optional().openapi({
    description: 'Optional category ID filter. Creation requires an existing, enabled category.',
    example: '00000000-0000-4000-8000-000000000002',
  }),
  requesterId: z.string().min(1).optional().openapi({
    description:
      'Optional requester user ID. Defaults to the current user on creation; user cannot submit for another user and list queries always restrict user to their own ID.',
    example: '00000000-0000-4000-8000-000000000003',
  }),
  handlerId: z.string().min(1).optional().openapi({
    description: 'Optional handler user ID filter.',
    example: '00000000-0000-4000-8000-000000000004',
  }),
  keyword: z.string().trim().min(1).optional().openapi({
    description:
      'Optional non-empty keyword after trimming. Case-insensitive search across ticket title and description.',
    example: 'login',
  }),
  createdFrom: z.iso.datetime().optional().openapi({
    description: 'Optional inclusive creation-time lower bound in UTC ISO 8601 format.',
    example: '2026-10-01T00:00:00.000Z',
  }),
  createdTo: z.iso.datetime().optional().openapi({
    description: 'Optional inclusive creation-time upper bound in UTC ISO 8601 format.',
    example: '2026-10-31T23:59:59.000Z',
  }),
})

export type TicketListQueryType = z.infer<typeof ticketListQuerySchema>

export const transitionRequestSchema = z.object({
  to: z.enum(['in_progress', 'resolved', 'closed', 'cancelled']).openapi({
    description:
      'Target ticket status. Must satisfy current-state and actor-permission rules; cannot return to pending.',
    example: 'resolved',
  }),
})

export const assignRequestSchema = z.object({
  handlerId: z.string().min(1).openapi({
    description: 'Handler user ID. The assignment target must be an active agent or admin.',
    example: '00000000-0000-4000-8000-000000000004',
  }),
})

export const ticketResponseSchema = successEnvelopeSchema(publicTicketSchema)

export const ticketListResponseSchema = paginatedEnvelopeSchema(publicTicketSchema)

export const ticketFailureResponseSchema = failureEnvelopeSchema
