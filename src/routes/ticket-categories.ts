import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'

import { paginatedEnvelope, successEnvelope } from '../lib/response.ts'
import { requireAuth, requireRole } from '../middleware/guards.ts'
import { DrizzleTicketCategoryRepository } from '../repositories/ticket-category-repository.ts'
import type {
  TicketCategoryListFilter,
  TicketCategoryPatch,
  TicketCategoryRepository,
} from '../repositories/ticket-category-repository.ts'
import { createTicketCategoryService } from '../services/ticket-category.ts'
import type { AppVariables } from '../types.ts'
import {
  createTicketCategoryRequestSchema,
  ticketCategoryFailureResponseSchema,
  ticketCategoryListQuerySchema,
  ticketCategoryListResponseSchema,
  ticketCategoryResponseSchema,
  updateTicketCategoryRequestSchema,
} from '../schemas/ticket-category.ts'

export type TicketCategoryRouteDependencies = {
  ticketCategoryRepository?: TicketCategoryRepository
}

const adminGuard = [requireAuth, requireRole('admin')]
const idParamSchema = z.object({ id: z.string().min(1) })

const createCategoryRoute = createRoute({
  method: 'post',
  path: '/api/ticket-categories',
  operationId: 'createTicketCategory',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Ticket Categories'],
  summary: 'Create a ticket category (admin)',
  request: {
    body: {
      content: { 'application/json': { schema: createTicketCategoryRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketCategoryResponseSchema } },
      description: 'Category created',
    },
    400: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'Validation failed',
    },
    409: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'Name taken',
    },
  },
})

const listCategoriesRoute = createRoute({
  method: 'get',
  path: '/api/ticket-categories',
  operationId: 'listTicketCategories',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Ticket Categories'],
  summary: 'List ticket categories',
  request: { query: ticketCategoryListQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketCategoryListResponseSchema } },
      description: 'Paginated categories',
    },
  },
})

const getCategoryRoute = createRoute({
  method: 'get',
  path: '/api/ticket-categories/:id',
  operationId: 'getTicketCategory',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Ticket Categories'],
  summary: 'Read one ticket category',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketCategoryResponseSchema } },
      description: 'Category',
    },
    404: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'Not found',
    },
  },
})

const updateCategoryRoute = createRoute({
  method: 'patch',
  path: '/api/ticket-categories/:id',
  operationId: 'updateTicketCategory',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Ticket Categories'],
  summary: 'Update a ticket category (admin)',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateTicketCategoryRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketCategoryResponseSchema } },
      description: 'Updated category',
    },
    400: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'Validation failed',
    },
    404: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'Not found',
    },
    409: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'Name taken',
    },
  },
})

const requestPath = (context: { req: { url: string } }): string => new URL(context.req.url).pathname

const toFilter = (
  query: z.infer<typeof ticketCategoryListQuerySchema>,
): TicketCategoryListFilter => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
  ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
})

export const registerTicketCategoryRoutes = (
  app: OpenAPIHono<{ Variables: AppVariables }>,
  dependencies: TicketCategoryRouteDependencies = {},
) => {
  const service = createTicketCategoryService({
    ticketCategoryRepository:
      dependencies.ticketCategoryRepository ?? new DrizzleTicketCategoryRepository(),
  })

  app.openapi(createCategoryRoute, async (context) => {
    const body = context.req.valid('json')
    const category = await service.create({
      name: body.name,
      description: body.description ?? null,
    })
    return context.json(successEnvelope({ path: requestPath(context), data: category }), 200)
  })

  app.openapi(listCategoriesRoute, async (context) => {
    const query = context.req.valid('query')
    const { items, total } = await service.list(toFilter(query))
    const totalPages = Math.ceil(total / query.pageSize)
    return context.json(
      paginatedEnvelope({
        path: requestPath(context),
        data: items,
        meta: { page: query.page, pageSize: query.pageSize, total, totalPages },
      }),
      200,
    )
  })

  app.openapi(getCategoryRoute, async (context) => {
    const { id } = context.req.valid('param')
    const category = await service.get(id)
    return context.json(successEnvelope({ path: requestPath(context), data: category }), 200)
  })

  app.openapi(updateCategoryRoute, async (context) => {
    const { id } = context.req.valid('param')
    const body = context.req.valid('json')
    const patch: TicketCategoryPatch = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    }
    const category = await service.update(id, patch)
    return context.json(successEnvelope({ path: requestPath(context), data: category }), 200)
  })
}
