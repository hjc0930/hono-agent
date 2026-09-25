import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'

import { requireAuth } from '../middleware/guards.ts'
import { DrizzleRefreshTokenRepository } from '../repositories/refresh-token-repository.ts'
import type { RefreshTokenRepository } from '../repositories/refresh-token-repository.ts'
import { DrizzleUserRepository } from '../repositories/user-repository.ts'
import type { UserRepository } from '../repositories/user-repository.ts'
import { successEnvelope } from '../lib/response.ts'
import { createAuthService } from '../services/auth.ts'
import type { AppVariables } from '../types.ts'
import {
  authFailureResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  meResponseSchema,
  refreshRequestSchema,
  refreshResponseSchema,
} from '../schemas/auth.ts'

export type AuthRouteDependencies = {
  userRepository?: UserRepository
  refreshTokenRepository?: RefreshTokenRepository
}

const loginRoute = createRoute({
  method: 'post',
  path: '/api/auth/login',
  operationId: 'login',
  security: [],
  tags: ['Auth'],
  summary: 'Log in with username and password',
  request: {
    body: { content: { 'application/json': { schema: loginRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: loginResponseSchema } },
      description: 'Token pair issued',
    },
    400: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'Validation failed',
    },
    401: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'Invalid credentials',
    },
    403: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'Account is disabled',
    },
  },
})

const refreshRoute = createRoute({
  method: 'post',
  path: '/api/auth/refresh',
  operationId: 'refresh',
  security: [],
  tags: ['Auth'],
  summary: 'Rotate the refresh token and mint a new access token',
  request: {
    body: { content: { 'application/json': { schema: refreshRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: refreshResponseSchema } },
      description: 'New token pair issued',
    },
    400: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'Validation failed',
    },
    401: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'Invalid refresh token',
    },
  },
})

const logoutRoute = createRoute({
  method: 'post',
  path: '/api/auth/logout',
  operationId: 'logout',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Auth'],
  summary: 'Revoke the presented refresh token',
  request: {
    body: { content: { 'application/json': { schema: refreshRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: logoutResponseSchema } },
      description: 'Refresh token revoked',
    },
    400: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'Validation failed',
    },
    401: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'Authentication required',
    },
  },
})

const meRoute = createRoute({
  method: 'get',
  path: '/api/auth/me',
  operationId: 'me',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  tags: ['Auth'],
  summary: 'Return the current user from a fresh repository read',
  responses: {
    200: {
      content: { 'application/json': { schema: meResponseSchema } },
      description: 'Current user',
    },
    401: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'Authentication required',
    },
    403: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'Account is disabled',
    },
  },
})

const requestPath = (context: { req: { url: string } }): string => new URL(context.req.url).pathname

export const registerAuthRoutes = (
  app: OpenAPIHono<{ Variables: AppVariables }>,
  dependencies: AuthRouteDependencies = {},
) => {
  const authService = createAuthService({
    userRepository: dependencies.userRepository ?? new DrizzleUserRepository(),
    refreshTokenRepository:
      dependencies.refreshTokenRepository ?? new DrizzleRefreshTokenRepository(),
  })

  app.openapi(loginRoute, async (context) => {
    const body = context.req.valid('json')
    const result = await authService.login(body)
    return context.json(successEnvelope({ path: requestPath(context), data: result }), 200)
  })

  app.openapi(refreshRoute, async (context) => {
    const body = context.req.valid('json')
    const result = await authService.refresh(body)
    return context.json(successEnvelope({ path: requestPath(context), data: result }), 200)
  })

  app.openapi(logoutRoute, async (context) => {
    const body = context.req.valid('json')
    await authService.logout(body)
    return context.json(successEnvelope({ path: requestPath(context) }), 200)
  })

  app.openapi(meRoute, async (context) => {
    const userId = context.get('userId')
    const user = await authService.getCurrentUser(userId)
    return context.json(successEnvelope({ path: requestPath(context), data: user }), 200)
  })
}
