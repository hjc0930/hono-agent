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
