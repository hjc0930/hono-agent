import { z } from '@hono/zod-openapi'

import {
  failureEnvelopeSchema,
  paginatedEnvelopeSchema,
  successEnvelopeSchema,
} from './envelope.ts'
import { paginationQuerySchema } from './pagination.ts'

export const ticketCategorySchema = z.object({
  id: z.string().openapi({
    description: 'Unique resource ID.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
  name: z.string().openapi({ description: 'Category name.', example: 'Account Issues' }),
  description: z.string().nullable().openapi({
    description: 'Description text. May be null.',
    example: 'Please investigate why I cannot log in.',
  }),
  enabled: z.boolean().openapi({
    description:
      'Whether the category is enabled. Disabled categories cannot be used for new tickets.',
    example: true,
  }),
})

export const createTicketCategoryRequestSchema = z.object({
  name: z.string().trim().min(1).max(64).openapi({
    description: 'Unique category name, 1-64 characters after trimming.',
    example: 'Account Issues',
  }),
  description: z.string().trim().max(255).optional().openapi({
    description: 'Optional description, trimmed and limited to 255 characters.',
    example: 'Please investigate why I cannot log in.',
  }),
})

export const ticketCategoryListQuerySchema = paginationQuerySchema.extend({
  enabled: z.stringbool().optional().openapi({
    description:
      'Filter by enabled status. Prefer true/false. Also accepts 1/0, yes/no, on/off, y/n, and enabled/disabled, case-insensitively. Omit to include both states.',
    example: 'true',
  }),
  keyword: z.string().trim().min(1).optional().openapi({
    description:
      'Optional non-empty keyword after trimming. Case-insensitive search across category name and description.',
    example: 'login',
  }),
})

export type TicketCategoryListQueryType = z.infer<typeof ticketCategoryListQuerySchema>

export const updateTicketCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional().openapi({
      description: 'Optional unique category name, 1-64 characters after trimming.',
      example: 'Account Issues',
    }),
    description: z.string().trim().max(255).nullable().optional().openapi({
      description:
        'Optional description, trimmed and limited to 255 characters. Use null to clear it.',
      example: 'Please investigate why I cannot log in.',
    }),
    enabled: z.boolean().optional().openapi({
      description: 'Optional enabled flag. Disabled categories cannot be used for new tickets.',
      example: true,
    }),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  })

export const ticketCategoryResponseSchema = successEnvelopeSchema(ticketCategorySchema)

export const ticketCategoryListResponseSchema = paginatedEnvelopeSchema(ticketCategorySchema)

export const ticketCategoryFailureResponseSchema = failureEnvelopeSchema
