import { z } from '@hono/zod-openapi'

export const successEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    path: z.string(),
    date: z.iso.datetime(),
    message: z.string(),
    code: z.literal('OK'),
    data: dataSchema.optional().nullable(),
  })

// Envelope for mutations that return no data at all (the `data` key is absent).
export const bareSuccessEnvelopeSchema = z.object({
  path: z.string(),
  date: z.iso.datetime(),
  message: z.string(),
  code: z.literal('OK'),
})

export const metaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

// Envelope for list endpoints: `data` is an array and `meta` carries pagination.
export const paginatedEnvelopeSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    path: z.string(),
    date: z.iso.datetime(),
    message: z.string(),
    code: z.literal('OK'),
    data: z.array(itemSchema),
    meta: metaSchema,
  })

export const failureErrorDetailsSchema = z.object({
  message: z.array(z.string()),
  stack: z.string().optional(),
})

export const failureEnvelopeSchema = z.object({
  path: z.string(),
  date: z.iso.datetime(),
  message: z.string(),
  code: z.string(),
  errors: failureErrorDetailsSchema,
})
