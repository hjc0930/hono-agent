import { z } from '@hono/zod-openapi'

import {
  bareSuccessEnvelopeSchema,
  failureEnvelopeSchema,
  paginatedEnvelopeSchema,
  successEnvelopeSchema,
} from './envelope.ts'
import { paginationQuerySchema } from './pagination.ts'
import { publicUserSchema, usernameSchema } from './auth.ts'

export const createUserRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).optional(),
  role: z.enum(['admin', 'agent', 'user']).default('user'),
})

export const userListQuerySchema = paginationQuerySchema.extend({
  role: z.enum(['admin', 'agent', 'user']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  keyword: z.string().trim().min(1).optional(),
})

export const updateUserRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).nullable().optional(),
    role: z.enum(['admin', 'agent', 'user']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  })

export const resetPasswordRequestSchema = z.object({
  password: z.string().min(8).max(128),
})

export const userResponseSchema = successEnvelopeSchema(publicUserSchema)

export const userListResponseSchema = paginatedEnvelopeSchema(publicUserSchema)

export const resetPasswordResponseSchema = bareSuccessEnvelopeSchema

export const userFailureResponseSchema = failureEnvelopeSchema
