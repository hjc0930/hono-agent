import { createMiddleware } from 'hono/factory'

import { verifyAccessToken } from '../lib/access-token.ts'
import { forbiddenError, unauthorizedError } from '../lib/errors.ts'
import type { AppVariables, UserRole } from '../types.ts'

type GuardEnvironment = {
  Variables: AppVariables
}

export const requireAuth = createMiddleware<GuardEnvironment>(async (context, next) => {
  const authorization = context.req.header('Authorization')
  if (!authorization) throw unauthorizedError()

  const [scheme, token] = authorization.split(' ')
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) throw unauthorizedError()

  const payload = await verifyAccessToken(token)
  if (!payload) throw unauthorizedError()

  context.set('userId', payload.sub)
  context.set('userRole', payload.role)
  await next()
})

export const requireRole = (...allowed: UserRole[]) =>
  createMiddleware<GuardEnvironment>(async (context, next) => {
    const userRole = context.get('userRole')
    if (!userRole) throw unauthorizedError()
    if (!allowed.includes(userRole)) throw forbiddenError()
    await next()
  })
