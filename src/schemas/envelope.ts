import { z } from '@hono/zod-openapi'

export const successEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    path: z.string().openapi({
      description: 'Request pathname, without the origin or query string.',
      example: '/api/tickets',
    }),
    date: z.iso.datetime().openapi({
      description: 'UTC ISO 8601 timestamp when the server composes the response.',
      example: '2026-10-12T08:30:00.000Z',
    }),
    message: z.string().openapi({
      description:
        'Human-readable outcome description. Detailed failure messages are in errors.message.',
    }),
    code: z.literal('OK').openapi({
      description:
        'Stable business code. Success is always OK; interpret failures together with the HTTP status.',
    }),
    data: dataSchema.optional().nullable().openapi({
      description:
        'Business payload. May be null or omitted for operations without a payload. Mutually exclusive with errors.',
    }),
  })

// Envelope for mutations that return no data at all (the `data` key is absent).
export const bareSuccessEnvelopeSchema = z.object({
  path: z.string().openapi({
    description: 'Request pathname, without the origin or query string.',
    example: '/api/tickets',
  }),
  date: z.iso.datetime().openapi({
    description: 'UTC ISO 8601 timestamp when the server composes the response.',
    example: '2026-10-12T08:30:00.000Z',
  }),
  message: z.string().openapi({
    description:
      'Human-readable outcome description. Detailed failure messages are in errors.message.',
  }),
  code: z.literal('OK').openapi({
    description:
      'Stable business code. Success is always OK; interpret failures together with the HTTP status.',
  }),
})

export const metaSchema = z.object({
  page: z
    .number()
    .int()
    .positive()
    .openapi({ description: 'Page number, starting at 1.', example: 1 }),
  pageSize: z
    .number()
    .int()
    .positive()
    .openapi({ description: 'Number of records per page.', example: 20 }),
  total: z
    .number()
    .int()
    .nonnegative()
    .openapi({ description: 'Total number of records matching all filters.', example: 42 }),
  totalPages: z.number().int().nonnegative().openapi({
    description: 'Total pages: ceil(total/pageSize), or 0 when no records match.',
    example: 3,
  }),
})

// Envelope for list endpoints: `data` is an array and `meta` carries pagination.
export const paginatedEnvelopeSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    path: z.string().openapi({
      description: 'Request pathname, without the origin or query string.',
      example: '/api/tickets',
    }),
    date: z.iso.datetime().openapi({
      description: 'UTC ISO 8601 timestamp when the server composes the response.',
      example: '2026-10-12T08:30:00.000Z',
    }),
    message: z.string().openapi({
      description:
        'Human-readable outcome description. Detailed failure messages are in errors.message.',
    }),
    code: z.literal('OK').openapi({
      description:
        'Stable business code. Success is always OK; interpret failures together with the HTTP status.',
    }),
    data: z.array(itemSchema).openapi({
      description:
        'Records on the requested page. Always an array; empty results or pages beyond the last page return [].',
    }),
    meta: metaSchema.openapi({
      description: 'Pagination metadata alongside data. Present only for paginated lists.',
    }),
  })

export const failureErrorDetailsSchema = z.object({
  message: z.array(z.string()).openapi({
    description:
      'Failure detail messages. Validation failures provide one entry per field issue; other failures default to the outcome message.',
  }),
  stack: z.string().optional().openapi({
    description:
      'Optional error stack trace. May appear outside production; omitted in production.',
  }),
})

export const failureEnvelopeSchema = z.object({
  path: z.string().openapi({
    description: 'Request pathname, without the origin or query string.',
    example: '/api/tickets',
  }),
  date: z.iso.datetime().openapi({
    description: 'UTC ISO 8601 timestamp when the server composes the response.',
    example: '2026-10-12T08:30:00.000Z',
  }),
  message: z.string().openapi({
    description:
      'Human-readable outcome description. Detailed failure messages are in errors.message.',
  }),
  code: z.string().openapi({
    description:
      'Stable business code. Success is always OK; interpret failures together with the HTTP status.',
  }),
  errors: failureErrorDetailsSchema.openapi({
    description: 'Failure details. Present only on failure responses.',
  }),
})
