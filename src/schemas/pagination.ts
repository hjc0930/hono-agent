import { z } from '@hono/zod-openapi'

export const pageQuerySchema = z.coerce.number().int().min(1).default(1)
export const pageSizeQuerySchema = z.coerce.number().int().min(1).max(100).default(20)

export const paginationQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>
