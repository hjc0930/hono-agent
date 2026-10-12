import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'

import { requireAuth } from '../middleware/guards.ts'
import { DrizzleRefreshTokenRepository } from '../repositories/refresh-token-repository.ts'
import type { RefreshTokenRepository } from '../repositories/refresh-token-repository.ts'
import { DrizzleUserRepository } from '../repositories/user-repository.ts'
import type { UserRepository } from '../repositories/user-repository.ts'
import { AppError } from '../lib/errors.ts'
import { successEnvelope } from '../lib/response.ts'
import { createAuthService } from '../services/auth.ts'
import {
  createMemoryLoginAttemptTracker,
  type LoginAttemptTracker,
} from '../services/login-protection.ts'
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
  loginAttemptTracker?: LoginAttemptTracker
}

const loginRoute = createRoute({
  method: 'post',
  path: '/api/auth/login',
  operationId: 'login',
  security: [],
  tags: ['Auth'],
  summary: 'Log in with username and password',
  description:
    'Public endpoint; no access token is required. Valid credentials return user details and an access/refresh token pair. Usernames contain 3-32 lowercase letters, digits, underscores, or hyphens; passwords contain 8-128 characters. Unknown usernames and incorrect passwords both return AUTH_INVALID_CREDENTIALS. Defaults: 5 consecutive failures lock an account for 900 seconds; 20 failures from one IP within 900 seconds trigger throttling. Limits are configurable and block subsequent attempts after the threshold is reached. A successful login clears the account failure count; IP failures remain until the window expires.',
  request: {
    body: { content: { 'application/json': { schema: loginRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: loginResponseSchema } },
      description: 'OK: data contains the authenticated user and token pair.',
    },
    400: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'AUTH_INVALID_CREDENTIALS: unknown username or incorrect password; the response does not distinguish them.',
    },
    403: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'AUTH_ACCOUNT_DISABLED: credentials are correct, but the account is disabled.',
    },
    423: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'AUTH_ACCOUNT_LOCKED: consecutive login failures have temporarily locked the account.',
    },
    429: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'AUTH_RATE_LIMITED: the source IP has reached its failure limit within the configured window.',
    },
    500: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
  },
})

const refreshRoute = createRoute({
  method: 'post',
  path: '/api/auth/refresh',
  operationId: 'refresh',
  security: [],
  tags: ['Auth'],
  summary: 'Refresh and rotate tokens',
  description:
    'Public endpoint. Submit refreshToken in the JSON body; no Bearer access token is required. Success returns a new token pair and immediately invalidates the old refresh token. Store the replacement pair. Unknown, expired, or revoked tokens and disabled accounts return AUTH_INVALID_REFRESH_TOKEN. Reusing a rotated or revoked token also revokes all refresh tokens for that user.',
  request: {
    body: { content: { 'application/json': { schema: refreshRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: refreshResponseSchema } },
      description: 'OK: data contains the replacement token pair. Replace the stored tokens.',
    },
    400: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'AUTH_INVALID_REFRESH_TOKEN: unknown, expired, or revoked refresh token, or unavailable account. Token reuse revokes all refresh tokens for that user.',
    },
    500: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
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
  summary: 'Log out and revoke a refresh token',
  description:
    'Requires a valid Bearer access token and the refreshToken to revoke in the JSON body. Success returns the envelope without data. Only the submitted refresh token is revoked; access tokens remain valid until expiry. Unknown or already revoked refresh tokens return AUTH_INVALID_REFRESH_TOKEN.',
  request: {
    body: { content: { 'application/json': { schema: refreshRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: logoutResponseSchema } },
      description: 'OK: the refresh token was revoked. The response omits data.',
    },
    400: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
    },
    401: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'UNAUTHORIZED: invalid access token; or AUTH_INVALID_REFRESH_TOKEN: unknown or already revoked refresh token.',
    },
    500: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
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
  summary: 'Get the current user',
  description:
    'Available to every authenticated role. Re-reads the account identified by the access token and returns its current username, display name, role, and status without a password hash. A missing account returns UNAUTHORIZED; a disabled account returns AUTH_ACCOUNT_DISABLED. Use this endpoint to restore frontend session information.',
  responses: {
    200: {
      content: { 'application/json': { schema: meResponseSchema } },
      description: 'OK: data contains freshly loaded public details for the current user.',
    },
    401: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'UNAUTHORIZED: invalid access token or the account referenced by the token no longer exists.',
    },
    403: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description: 'AUTH_ACCOUNT_DISABLED: the current account is disabled.',
    },
    500: {
      content: { 'application/json': { schema: authFailureResponseSchema } },
      description:
        'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
    },
  },
})

const requestPath = (context: { req: { url: string } }): string => new URL(context.req.url).pathname

const clientIp = (context: { req: { header: (name: string) => string | undefined } }): string => {
  const forwarded = context.req.header('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first && first.length > 0 ? first : 'local'
}

export const registerAuthRoutes = (
  app: OpenAPIHono<{ Variables: AppVariables }>,
  dependencies: AuthRouteDependencies = {},
) => {
  const authService = createAuthService({
    userRepository: dependencies.userRepository ?? new DrizzleUserRepository(),
    refreshTokenRepository:
      dependencies.refreshTokenRepository ?? new DrizzleRefreshTokenRepository(),
  })
  const loginAttemptTracker = dependencies.loginAttemptTracker ?? createMemoryLoginAttemptTracker()

  app.openapi(loginRoute, async (context) => {
    const body = context.req.valid('json')
    const ip = clientIp(context)
    loginAttemptTracker.assertAllowed(ip, body.username)

    try {
      const result = await authService.login(body)
      loginAttemptTracker.recordSuccess(body.username)
      return context.json(successEnvelope({ path: requestPath(context), data: result }), 200)
    } catch (error) {
      if (error instanceof AppError && error.code === 'AUTH_INVALID_CREDENTIALS') {
        loginAttemptTracker.recordFailure(ip, body.username)
      }
      throw error
    }
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
