import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'

import { paginatedEnvelope, successEnvelope } from '../lib/response.ts'
import { requireAuth, requireRole } from '../middleware/guards.ts'
import { DrizzleUserRepository } from '../repositories/user-repository.ts'
import type { UserListFilter, UserPatch, UserRepository } from '../repositories/user-repository.ts'
import { createUserManagementService } from '../services/user-management.ts'
import type { AppVariables } from '../types.ts'
import {
  createUserRequestSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  updateUserRequestSchema,
  userFailureResponseSchema,
  userListQuerySchema,
  userListResponseSchema,
  userResponseSchema,
} from '../schemas/user.ts'

export type UserRouteDependencies = {
  userRepository?: UserRepository
}

const adminGuard = [requireAuth, requireRole('admin')]

const idParamSchema = z.object({ id: z.string().min(1) })

const createUserRoute = createRoute({
  method: 'post',
  path: '/api/users',
  operationId: 'createUser',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Users'],
  summary: 'Create a user (admin)',
  request: {
    body: { content: { 'application/json': { schema: createUserRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: userResponseSchema } },
      description: 'User created',
    },
    400: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'Validation failed',
    },
    409: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'Username taken',
    },
  },
})

const listUsersRoute = createRoute({
  method: 'get',
  path: '/api/users',
  operationId: 'listUsers',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Users'],
  summary: 'List users with pagination and filters (admin)',
  request: { query: userListQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: userListResponseSchema } },
      description: 'Paginated users',
    },
  },
})

const getUserRoute = createRoute({
  method: 'get',
  path: '/api/users/:id',
  operationId: 'getUser',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Users'],
  summary: 'Read one user (admin)',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: userResponseSchema } },
      description: 'User',
    },
    404: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'Not found',
    },
  },
})

const updateUserRoute = createRoute({
  method: 'patch',
  path: '/api/users/:id',
  operationId: 'updateUser',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Users'],
  summary: 'Update a user (admin)',
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateUserRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: userResponseSchema } },
      description: 'Updated user',
    },
    400: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'Validation failed',
    },
    403: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'Self-modification forbidden',
    },
    404: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'Not found',
    },
  },
})

const resetPasswordRoute = createRoute({
  method: 'post',
  path: '/api/users/:id/reset-password',
  operationId: 'resetPassword',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Users'],
  summary: 'Reset a user password (admin)',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: resetPasswordRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: resetPasswordResponseSchema } },
      description: 'Password reset',
    },
    400: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'Validation failed',
    },
    404: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'Not found',
    },
  },
})

const requestPath = (context: { req: { url: string } }): string => new URL(context.req.url).pathname

const toFilter = (query: z.infer<typeof userListQuerySchema>): UserListFilter => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.role !== undefined ? { role: query.role } : {}),
  ...(query.status !== undefined ? { status: query.status } : {}),
  ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
})

export const registerUserRoutes = (
  app: OpenAPIHono<{ Variables: AppVariables }>,
  dependencies: UserRouteDependencies = {},
) => {
  const service = createUserManagementService({
    userRepository: dependencies.userRepository ?? new DrizzleUserRepository(),
  })

  app.openapi(createUserRoute, async (context) => {
    const body = context.req.valid('json')
    const user = await service.createUser({
      username: body.username,
      password: body.password,
      role: body.role,
      displayName: body.displayName ?? null,
    })
    return context.json(successEnvelope({ path: requestPath(context), data: user }), 200)
  })

  app.openapi(listUsersRoute, async (context) => {
    const query = context.req.valid('query')
    const { items, total } = await service.listUsers(toFilter(query))
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

  app.openapi(getUserRoute, async (context) => {
    const { id } = context.req.valid('param')
    const user = await service.getUser(id)
    return context.json(successEnvelope({ path: requestPath(context), data: user }), 200)
  })

  app.openapi(updateUserRoute, async (context) => {
    const { id } = context.req.valid('param')
    const body = context.req.valid('json')
    const actorId = context.get('userId')
    const patch: UserPatch = {
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    }
    const user = await service.updateUser(id, actorId, patch)
    return context.json(successEnvelope({ path: requestPath(context), data: user }), 200)
  })

  app.openapi(resetPasswordRoute, async (context) => {
    const { id } = context.req.valid('param')
    const body = context.req.valid('json')
    await service.resetPassword(id, body.password)
    return context.json(successEnvelope({ path: requestPath(context) }), 200)
  })
}
