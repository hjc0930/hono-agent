import { z } from '@hono/zod-openapi'

import {
  bareSuccessEnvelopeSchema,
  failureEnvelopeSchema,
  successEnvelopeSchema,
} from './envelope.ts'

export const usernameSchema = z.string().regex(/^[a-z0-9_-]{3,32}$/)

export const loginRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(128),
})

export const publicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  role: z.enum(['admin', 'agent', 'user']),
  status: z.enum(['active', 'disabled']),
})

export const loginDataSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string(),
  user: publicUserSchema,
})

export const loginResponseSchema = successEnvelopeSchema(loginDataSchema)

export const refreshRequestSchema = z.object({
  refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
})

export const refreshDataSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string(),
})

export const refreshResponseSchema = successEnvelopeSchema(refreshDataSchema)

export const logoutResponseSchema = bareSuccessEnvelopeSchema

export const meDataSchema = publicUserSchema

export const meResponseSchema = successEnvelopeSchema(meDataSchema)

export const authFailureResponseSchema = failureEnvelopeSchema
