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
import type { UserListQueryType } from '../schemas/user.ts'

export type UserRouteDependencies = {
  userRepository?: UserRepository
}

const adminGuard = [requireAuth, requireRole('admin')]

const idParamSchema = z.object({
  id: z.string().min(1).openapi({
    description: 'Target user ID, as returned by a user creation or query operation.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
})

const createUserRoute = createRoute({
  method: 'post',
  path: '/api/users',
  operationId: 'createUser',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Users'],
  summary: 'Create a user (admin)',
  description:
    'Requires admin. The username must be unique and cannot be changed after creation. role defaults to user and the initial status is always active. Omitting displayName stores null. Returns public account details without a password or password hash.',
  request: {
    body: { content: { 'application/json': { schema: createUserRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: userResponseSchema } },
      description: 'OK: data contains the created public user with status active.',
    },
    400: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    409: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'USERNAME_TAKEN: the username is already in use.',
    },
    500: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    401: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
    403: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
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
  summary: 'List users with pagination (admin)',
  description:
    'Requires admin. Supports exact role/status filters and a case-insensitive keyword search across username and displayName. Filters apply together. Results are ordered by creation time ascending. data contains the user array and meta contains pagination details. No matches return an empty array.',
  request: { query: userListQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: userListResponseSchema } },
      description: 'OK: data contains the user array and meta contains pagination details.',
    },
    500: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    400: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
    403: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
    },
  },
})

const getUserRoute = createRoute({
  method: 'get',
  path: '/api/users/{id}',
  operationId: 'getUser',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Users'],
  summary: 'Get user details (admin)',
  description:
    'Requires admin. Looks up public account details by user ID. A missing account returns USER_NOT_FOUND. Passwords and password hashes are never returned.',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: userResponseSchema } },
      description: 'OK: data contains the requested public user.',
    },
    404: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'USER_NOT_FOUND: the target user does not exist.',
    },
    500: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    400: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
    403: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
    },
  },
})

const updateUserRoute = createRoute({
  method: 'patch',
  path: '/api/users/{id}',
  operationId: 'updateUser',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Users'],
  summary: 'Update user details and permissions (admin)',
  description:
    'Requires admin. Partially updates displayName, role, or status; at least one defined field is required. Omitted fields remain unchanged and displayName=null clears the display name. The username cannot be changed. Administrators cannot submit a role update for themselves, even with the same value, or disable their own account. Role changes and disabling may take until existing access tokens expire to affect ordinary routes.',
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateUserRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: userResponseSchema } },
      description: 'OK: data contains the updated public user.',
    },
    400: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    403: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'FORBIDDEN: administrator role required; or SELF_MODIFICATION_FORBIDDEN: attempted to change the their own administrator role or disable their own account.',
    },
    404: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'USER_NOT_FOUND: the target user does not exist.',
    },
    500: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    401: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
  },
})

const resetPasswordRoute = createRoute({
  method: 'post',
  path: '/api/users/{id}/reset-password',
  operationId: 'resetPassword',
  security: [{ bearerAuth: [] }],
  middleware: adminGuard,
  tags: ['Users'],
  summary: 'Reset a user password (admin)',
  description:
    'Requires admin. Sets a new password of 8-128 characters and stores its hash. A missing account returns USER_NOT_FOUND. Success returns only the envelope, without data. Existing access tokens and refresh tokens are not revoked by this operation.',
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
      description: 'OK: the password was reset. The response omits data.',
    },
    400: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    404: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description: 'USER_NOT_FOUND: the target user does not exist.',
    },
    500: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
    401: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.',
    },
    403: {
      content: { 'application/json': { schema: userFailureResponseSchema } },
      description:
        'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
    },
  },
})

const requestPath = (context: { req: { url: string } }): string => new URL(context.req.url).pathname

const toFilter = (query: UserListQueryType): UserListFilter => ({
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
