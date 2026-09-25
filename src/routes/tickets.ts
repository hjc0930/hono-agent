import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'

import { paginatedEnvelope, successEnvelope } from '../lib/response.ts'
import { requireAuth, requireRole } from '../middleware/guards.ts'
import { DrizzleTicketCategoryRepository } from '../repositories/ticket-category-repository.ts'
import type { TicketCategoryRepository } from '../repositories/ticket-category-repository.ts'
import { DrizzleTicketCommentRepository } from '../repositories/ticket-comment-repository.ts'
import type { TicketCommentRepository } from '../repositories/ticket-comment-repository.ts'
import { DrizzleTicketEventRepository } from '../repositories/ticket-event-repository.ts'
import type { TicketEventRepository } from '../repositories/ticket-event-repository.ts'
import { DrizzleTicketRepository } from '../repositories/ticket-repository.ts'
import type { TicketListFilter, TicketRepository } from '../repositories/ticket-repository.ts'
import { DrizzleUserRepository } from '../repositories/user-repository.ts'
import type { UserRepository } from '../repositories/user-repository.ts'
import { createTicketAssignmentService } from '../services/ticket-assignment.ts'
import { createTicketCommentService } from '../services/ticket-comment.ts'
import { createTicketStateMachine } from '../services/ticket-state-machine.ts'
import { createTicketService, type ActorContext } from '../services/ticket.ts'
import type { AppVariables } from '../types.ts'
import {
  assignRequestSchema,
  createTicketRequestSchema,
  ticketFailureResponseSchema,
  ticketListQuerySchema,
  ticketListResponseSchema,
  ticketResponseSchema,
  transitionRequestSchema,
} from '../schemas/ticket.ts'
import {
  commentFailureResponseSchema,
  commentListResponseSchema,
  commentResponseSchema,
  createCommentRequestSchema,
} from '../schemas/ticket-comment.ts'

export type TicketRouteDependencies = {
  ticketRepository?: TicketRepository
  ticketCategoryRepository?: TicketCategoryRepository
  ticketEventRepository?: TicketEventRepository
  ticketCommentRepository?: TicketCommentRepository
  userRepository?: UserRepository
}

const idParamSchema = z.object({ id: z.string().min(1) })

const createTicketRoute = createRoute({
  method: 'post',
  path: '/api/tickets',
  operationId: 'createTicket',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'Create a ticket',
  request: {
    body: {
      content: { 'application/json': { schema: createTicketRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketResponseSchema } },
      description: 'Ticket created',
    },
    400: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'Validation failed or invalid category',
    },
    403: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'Requester override denied',
    },
  },
})

const listTicketsRoute = createRoute({
  method: 'get',
  path: '/api/tickets',
  operationId: 'listTickets',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'List tickets with filters',
  request: { query: ticketListQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketListResponseSchema } },
      description: 'Paginated tickets',
    },
  },
})

const getTicketRoute = createRoute({
  method: 'get',
  path: '/api/tickets/:id',
  operationId: 'getTicket',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'Read one ticket',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketResponseSchema } },
      description: 'Ticket',
    },
    404: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'Not found',
    },
    403: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'Visibility denied',
    },
  },
})

const transitionTicketRoute = createRoute({
  method: 'post',
  path: '/api/tickets/:id/transition',
  operationId: 'transitionTicket',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'Transition a ticket status',
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: transitionRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketResponseSchema } },
      description: 'Updated ticket',
    },
    400: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'Invalid transition',
    },
    404: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'Not found',
    },
    403: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'Role not allowed',
    },
  },
})

const assignTicketRoute = createRoute({
  method: 'post',
  path: '/api/tickets/:id/assign',
  operationId: 'assignTicket',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth, requireRole('admin')],
  tags: ['Tickets'],
  summary: 'Assign a ticket to a handler (admin)',
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: assignRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketResponseSchema } },
      description: 'Updated ticket',
    },
    400: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'Invalid handler or state',
    },
    404: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'Not found',
    },
  },
})

const addCommentRoute = createRoute({
  method: 'post',
  path: '/api/tickets/:id/comments',
  operationId: 'addTicketComment',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'Add a comment to a ticket',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: createCommentRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: commentResponseSchema } },
      description: 'Comment created',
    },
    400: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description: 'Validation failed',
    },
    403: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description: 'Not allowed',
    },
    404: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description: 'Not found',
    },
  },
})

const listCommentsRoute = createRoute({
  method: 'get',
  path: '/api/tickets/:id/comments',
  operationId: 'listTicketComments',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'List comments on a ticket',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: commentListResponseSchema } },
      description: 'Comments',
    },
    404: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description: 'Not found',
    },
    403: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description: 'Visibility denied',
    },
  },
})

const requestPath = (context: { req: { url: string } }): string => new URL(context.req.url).pathname

const actorFrom = (context: { get: (key: 'userId' | 'userRole') => string }): ActorContext => ({
  userId: context.get('userId'),
  role: context.get('userRole') as ActorContext['role'],
})

const toFilter = (query: z.infer<typeof ticketListQuerySchema>): TicketListFilter => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.status !== undefined ? { status: query.status } : {}),
  ...(query.priority !== undefined ? { priority: query.priority } : {}),
  ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
  ...(query.requesterId !== undefined ? { requesterId: query.requesterId } : {}),
  ...(query.handlerId !== undefined ? { handlerId: query.handlerId } : {}),
  ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
  ...(query.createdFrom !== undefined ? { createdFrom: new Date(query.createdFrom) } : {}),
  ...(query.createdTo !== undefined ? { createdTo: new Date(query.createdTo) } : {}),
})

export const registerTicketRoutes = (
  app: OpenAPIHono<{ Variables: AppVariables }>,
  dependencies: TicketRouteDependencies = {},
) => {
  const ticketRepository = dependencies.ticketRepository ?? new DrizzleTicketRepository()
  const ticketCategoryRepository =
    dependencies.ticketCategoryRepository ?? new DrizzleTicketCategoryRepository()
  const ticketEventRepository =
    dependencies.ticketEventRepository ?? new DrizzleTicketEventRepository()
  const ticketCommentRepository =
    dependencies.ticketCommentRepository ?? new DrizzleTicketCommentRepository()
  const userRepository = dependencies.userRepository ?? new DrizzleUserRepository()

  const ticketService = createTicketService({ ticketRepository, ticketCategoryRepository })
  const stateMachine = createTicketStateMachine({ ticketRepository, ticketEventRepository })
  const assignmentService = createTicketAssignmentService({
    ticketRepository,
    ticketEventRepository,
    userRepository,
  })
  const commentService = createTicketCommentService({ ticketRepository, ticketCommentRepository })

  app.openapi(createTicketRoute, async (context) => {
    const body = context.req.valid('json')
    const ticket = await ticketService.create(
      {
        title: body.title,
        description: body.description,
        categoryId: body.categoryId,
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.requesterId !== undefined ? { requesterId: body.requesterId } : {}),
      },
      actorFrom(context),
    )
    return context.json(successEnvelope({ path: requestPath(context), data: ticket }), 200)
  })

  app.openapi(listTicketsRoute, async (context) => {
    const query = context.req.valid('query')
    const { items, total } = await ticketService.list(toFilter(query), actorFrom(context))
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

  app.openapi(getTicketRoute, async (context) => {
    const { id } = context.req.valid('param')
    const ticket = await ticketService.get(id, actorFrom(context))
    return context.json(successEnvelope({ path: requestPath(context), data: ticket }), 200)
  })

  app.openapi(transitionTicketRoute, async (context) => {
    const { id } = context.req.valid('param')
    const body = context.req.valid('json')
    const ticket = await stateMachine.transition({
      ticketId: id,
      to: body.to,
      actor: actorFrom(context),
    })
    return context.json(successEnvelope({ path: requestPath(context), data: ticket }), 200)
  })

  app.openapi(assignTicketRoute, async (context) => {
    const { id } = context.req.valid('param')
    const body = context.req.valid('json')
    const ticket = await assignmentService.assign({
      ticketId: id,
      handlerId: body.handlerId,
      actor: actorFrom(context),
    })
    return context.json(successEnvelope({ path: requestPath(context), data: ticket }), 200)
  })

  app.openapi(addCommentRoute, async (context) => {
    const { id } = context.req.valid('param')
    const body = context.req.valid('json')
    const comment = await commentService.addComment({
      ticketId: id,
      body: body.body,
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      actor: actorFrom(context),
    })
    return context.json(successEnvelope({ path: requestPath(context), data: comment }), 200)
  })

  app.openapi(listCommentsRoute, async (context) => {
    const { id } = context.req.valid('param')
    const comments = await commentService.listComments({ ticketId: id, actor: actorFrom(context) })
    return context.json(successEnvelope({ path: requestPath(context), data: comments }), 200)
  })
}
