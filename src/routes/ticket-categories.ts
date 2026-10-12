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
import type { TicketCategoryListQueryType } from '../schemas/ticket-category.ts'

export type TicketCategoryRouteDependencies = {
  ticketCategoryRepository?: TicketCategoryRepository
}

const adminGuard = [requireAuth, requireRole('admin')]
const idParamSchema = z.object({
  id: z.string().min(1).openapi({
    description: 'Target category ID, as returned by a category creation or query operation.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
})

const createCategoryRoute = createRoute({
  method: 'post',
  path: '/api/ticket-categories',
  operationId: 'createTicketCategory',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Ticket Categories'],
  summary: 'Create a ticket category (admin)',
  description:
    'Requires admin. The name must be unique and contain 1-64 characters after trimming. description is optional and stored as null when omitted. New categories are enabled by default. Returns the created category.',
  request: {
    body: {
      content: { 'application/json': { schema: createTicketCategoryRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketCategoryResponseSchema } },
      description: 'OK: data contains the created category with enabled=true.',
    },
    400: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    409: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'CATEGORY_NAME_TAKEN: the category name is already in use.',
    },
    500: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    401: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
    403: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
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
  summary: 'List ticket categories with pagination',
  description:
    'Available to every authenticated role. Results are ordered by creation time ascending. Omitting enabled includes both enabled and disabled categories. Supports enabled filtering and a case-insensitive keyword search across name and description. data contains the category array and meta contains pagination details.',
  request: { query: ticketCategoryListQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketCategoryListResponseSchema } },
      description: 'OK: data contains the category array and meta contains pagination details.',
    },
    500: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    400: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
  },
})

const getCategoryRoute = createRoute({
  method: 'get',
  path: '/api/ticket-categories/{id}',
  operationId: 'getTicketCategory',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Ticket Categories'],
  summary: 'Get ticket category details',
  description:
    'Available to every authenticated role. Returns the category name, description, and enabled flag by ID. Disabled categories remain readable. A missing category returns CATEGORY_NOT_FOUND.',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketCategoryResponseSchema } },
      description: 'OK: data contains the requested category.',
    },
    404: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'CATEGORY_NOT_FOUND: the category does not exist.',
    },
    500: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    400: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
  },
})

const updateCategoryRoute = createRoute({
  method: 'patch',
  path: '/api/ticket-categories/{id}',
  operationId: 'updateTicketCategory',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Ticket Categories'],
  summary: 'Update or disable a ticket category (admin)',
  description:
    'Requires admin. Partially updates name, description, or enabled; at least one defined field is required. Omitted fields remain unchanged and description=null clears the description. Names must be unique. Disabled categories cannot be used for new tickets; existing tickets retain their category reference. There is no physical deletion endpoint.',
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
      description: 'OK: data contains the updated category.',
    },
    400: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    404: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'CATEGORY_NOT_FOUND: the category does not exist.',
    },
    409: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description: 'CATEGORY_NAME_TAKEN: another category already uses the requested name.',
    },
    500: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    401: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
    403: {
      content: { 'application/json': { schema: ticketCategoryFailureResponseSchema } },
      description:
        'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
    },
  },
})

const requestPath = (context: { req: { url: string } }): string => new URL(context.req.url).pathname

const toFilter = (query: TicketCategoryListQueryType): TicketCategoryListFilter => ({
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
