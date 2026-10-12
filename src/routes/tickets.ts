import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'

import { paginatedEnvelope, successEnvelope } from '../lib/response.ts'
import { requireAuth, requireRole } from '../middleware/guards.ts'
import { DrizzleTicketCategoryRepository } from '../repositories/ticket-category-repository.ts'
import type { TicketCategoryRepository } from '../repositories/ticket-category-repository.ts'
import { DrizzleTicketCommentRepository } from '../repositories/ticket-comment-repository.ts'
import type { TicketCommentRepository } from '../repositories/ticket-comment-repository.ts'
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
import type { TicketListQueryType } from '../schemas/ticket.ts'
import {
  commentFailureResponseSchema,
  commentListResponseSchema,
  commentResponseSchema,
  createCommentRequestSchema,
} from '../schemas/ticket-comment.ts'

export type TicketRouteDependencies = {
  ticketRepository?: TicketRepository
  ticketCategoryRepository?: TicketCategoryRepository
  ticketCommentRepository?: TicketCommentRepository
  userRepository?: UserRepository
}

const idParamSchema = z.object({
  id: z.string().min(1).openapi({
    description: 'Target ticket ID, as returned by a ticket creation or query operation.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
})

const createTicketRoute = createRoute({
  method: 'post',
  path: '/api/tickets',
  operationId: 'createTicket',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'Create a ticket',
  description:
    'Available to every authenticated role. categoryId must reference an existing, enabled category. priority defaults to medium. requesterId defaults to the current user; user can only create tickets for themselves, while agent/admin may submit on behalf of another user. New tickets have status=pending and handlerId=null. Returns the ticket with HTTP 200.',
  request: {
    body: {
      content: { 'application/json': { schema: createTicketRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketResponseSchema } },
      description: 'OK: data contains the created ticket with status pending and no handler.',
    },
    400: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: invalid request fields; or INVALID_CATEGORY: the category does not exist or is disabled.',
    },
    403: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'FORBIDDEN: a user attempted to submit a ticket for another user.',
    },
    500: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    401: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
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
  summary: 'Search tickets with pagination',
  description:
    'Available to every authenticated role. For user, requesterId is always overridden with the current user ID, limiting results to their own tickets. agent/admin can query all tickets. Filters include status, priority, category, requester, handler, and creation time range. keyword matches title or description case-insensitively. Filters apply together and time boundaries are inclusive. Results are ordered by creation time descending; data contains the array and meta contains pagination details.',
  request: { query: ticketListQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketListResponseSchema } },
      description: 'OK: data contains visible tickets and meta contains pagination details.',
    },
    500: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    400: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
  },
})

const getTicketRoute = createRoute({
  method: 'get',
  path: '/api/tickets/{id}',
  operationId: 'getTicket',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'Get ticket details',
  description:
    'Available to every authenticated role. user can only read their own tickets; agent/admin can read any ticket. Returns ticket fields, related resource IDs, and timestamps. Comments are retrieved through the separate comments endpoint.',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketResponseSchema } },
      description: 'OK: data contains the ticket details.',
    },
    404: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'TICKET_NOT_FOUND: the ticket does not exist.',
    },
    403: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'FORBIDDEN: a user attempted to read a ticket belonging to another user.',
    },
    500: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    400: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
  },
})

const transitionTicketRoute = createRoute({
  method: 'post',
  path: '/api/tickets/{id}/transition',
  operationId: 'transitionTicket',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'Transition ticket status',
  description:
    'Requires authentication. The server reads the current status. Allowed transitions: pending to in_progress/cancelled; in_progress to resolved/cancelled; resolved to closed/in_progress. closed and cancelled are terminal. pending to in_progress and in_progress to resolved require agent/admin. Cancelling, confirming closure, and reopening require the requester or admin. Resolving requires an assigned handlerId. Every successful transition atomically updates the status and appends an audit event. A direct transition to in_progress does not assign a handler; use the assign endpoint for assignment.',
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: transitionRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketResponseSchema } },
      description:
        'OK: data contains the updated ticket; the status and audit event were committed.',
    },
    400: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: invalid request fields; or INVALID_STATE_TRANSITION: illegal transition, concurrent status change, or resolving without an assigned handler.',
    },
    404: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'TICKET_NOT_FOUND: the ticket does not exist.',
    },
    403: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'FORBIDDEN: the role or requester identity does not permit this transition.',
    },
    500: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    401: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
  },
})

const assignTicketRoute = createRoute({
  method: 'post',
  path: '/api/tickets/{id}/assign',
  operationId: 'assignTicket',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth, requireRole('admin')],
  tags: ['Tickets'],
  summary: 'Assign or replace a ticket handler (admin)',
  description:
    'Requires admin. handlerId must reference an active agent or admin. Assigning a pending ticket moves it to in_progress and atomically records a status event. Assigning an in_progress ticket only changes its handler. Tickets in resolved, closed, or cancelled cannot be assigned. Returns the updated ticket.',
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: assignRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ticketResponseSchema } },
      description: 'OK: data contains the assigned ticket; pending tickets move to in_progress.',
    },
    400: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: invalid fields; INVALID_HANDLER: missing or disabled handler, or user role; INVALID_STATE_TRANSITION: the ticket is not pending/in_progress or its status changed.',
    },
    404: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description: 'TICKET_NOT_FOUND: the ticket does not exist.',
    },
    500: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    401: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
    403: {
      content: { 'application/json': { schema: ticketFailureResponseSchema } },
      description:
        'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
    },
  },
})

const addCommentRoute = createRoute({
  method: 'post',
  path: '/api/tickets/{id}/comments',
  operationId: 'addTicketComment',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'Add a public reply or internal note',
  description:
    'Available to every authenticated role. body is plain text containing 1-5000 characters and kind defaults to public. user can post public replies only on their own tickets. agent/admin can post public or internal comments on any ticket. The author is the current user. Comments are append-only and cannot be edited or deleted. Comments are currently allowed on closed and cancelled tickets.',
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
      description: 'OK: data contains the created comment.',
    },
    400: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    403: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description:
        'FORBIDDEN: a user attempted to comment on a ticket belonging to another user or create an internal note.',
    },
    404: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description: 'TICKET_NOT_FOUND: the ticket does not exist.',
    },
    500: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    401: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
  },
})

const listCommentsRoute = createRoute({
  method: 'get',
  path: '/api/tickets/{id}/comments',
  operationId: 'listTicketComments',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Tickets'],
  summary: 'List ticket comments',
  description:
    'Available to every authenticated role. Returns the complete visible comment array in creation-time ascending order, without pagination or meta. user can read only public comments on their own tickets. agent/admin can read public and internal comments on any ticket. No comments return data=[].',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: commentListResponseSchema } },
      description: 'OK: data contains visible comments in chronological order, without pagination.',
    },
    404: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description: 'TICKET_NOT_FOUND: the ticket does not exist.',
    },
    403: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description:
        'FORBIDDEN: a user attempted to read comments on a ticket belonging to another user.',
    },
    500: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    400: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: commentFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
  },
})

const requestPath = (context: { req: { url: string } }): string => new URL(context.req.url).pathname

const actorFrom = (context: { get: (key: 'userId' | 'userRole') => string }): ActorContext => ({
  userId: context.get('userId'),
  role: context.get('userRole') as ActorContext['role'],
})

const toFilter = (query: TicketListQueryType): TicketListFilter => ({
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
  const ticketCommentRepository =
    dependencies.ticketCommentRepository ?? new DrizzleTicketCommentRepository()
  const userRepository = dependencies.userRepository ?? new DrizzleUserRepository()

  const ticketService = createTicketService({ ticketRepository, ticketCategoryRepository })
  const stateMachine = createTicketStateMachine({ ticketRepository })
  const assignmentService = createTicketAssignmentService({
    ticketRepository,
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
