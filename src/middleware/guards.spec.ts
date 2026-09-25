import { sign } from 'hono/jwt'
import { Hono } from 'hono'

import { describe, expect, it } from 'vitest'

import { env } from '../config/env.ts'
import { errorHandler } from './error-handler.ts'
import { requestContext } from './request-context.ts'
import { requireAuth, requireRole } from './guards.ts'
import type { AppVariables, UserRole } from '../types.ts'

const signTestToken = (options: { sub: string; role: UserRole; expiresInSec?: number }) => {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    {
      sub: options.sub,
      role: options.role,
      iat: now - 10,
      exp: now + (options.expiresInSec ?? 60),
    },
    env.JWT_SECRET,
    'HS256',
  )
}

const createGuardApp = () => {
  const app = new Hono<{ Variables: AppVariables }>()
  app.use('*', requestContext)
  app.onError(errorHandler)
  app.get('/probe', requireAuth, (context) =>
    context.json({ userId: context.get('userId'), userRole: context.get('userRole') }),
  )
  app.get('/agents-only', requireAuth, requireRole('agent'), (context) => context.text('ok'))
  app.get('/agents-and-admins', requireAuth, requireRole('agent', 'admin'), (context) =>
    context.text('ok'),
  )
  app.get('/role-without-auth', requireRole('admin'), (context) => context.text('ok'))
  return app
}

const authedGet = (path: string, token: string) =>
  createGuardApp().request(path, { headers: { Authorization: `Bearer ${token}` } })

describe('requireAuth', () => {
  it('rejects a missing Authorization header with the common envelope', async () => {
    const response = await createGuardApp().request('/probe')
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toMatchObject({
      path: '/probe',
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      errors: { message: ['Authentication required'] },
    })
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })

  it('rejects a non-Bearer scheme', async () => {
    const token = await signTestToken({ sub: 'u1', role: 'user' })
    const response = await createGuardApp().request('/probe', {
      headers: { Authorization: `Token ${token}` },
    })
    expect(response.status).toBe(401)
  })

  it('rejects a malformed token', async () => {
    const response = await authedGet('/probe', 'not-a-jwt')
    expect(response.status).toBe(401)
  })

  it('rejects an expired token', async () => {
    const token = await signTestToken({ sub: 'u1', role: 'user', expiresInSec: -60 })
    const response = await authedGet('/probe', token)
    expect(response.status).toBe(401)
  })

  it('rejects a token signed with a different secret', async () => {
    const now = Math.floor(Date.now() / 1000)
    const foreign = await sign(
      { sub: 'u1', role: 'user', iat: now, exp: now + 60 },
      'y'.repeat(48),
      'HS256',
    )
    const response = await authedGet('/probe', foreign)
    expect(response.status).toBe(401)
  })

  it('rejects a forged alg:none token', async () => {
    const forged = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: 'u1', role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString('base64url')}.`
    const response = await authedGet('/probe', forged)
    expect(response.status).toBe(401)
  })

  it('passes a valid token and exposes userId/userRole to the handler', async () => {
    const response = await authedGet(
      '/probe',
      await signTestToken({ sub: 'user-42', role: 'admin' }),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ userId: 'user-42', userRole: 'admin' })
  })
})

describe('requireRole', () => {
  it('passes when the role is in the allow-list', async () => {
    const token = await signTestToken({ sub: 'u1', role: 'agent' })
    const response = await authedGet('/agents-only', token)
    expect(response.status).toBe(200)
  })

  it('rejects a role outside the allow-list with 403 FORBIDDEN', async () => {
    const token = await signTestToken({ sub: 'u1', role: 'user' })
    const response = await authedGet('/agents-only', token)
    const body = await response.json()
    expect(response.status).toBe(403)
    expect(body).toMatchObject({ code: 'FORBIDDEN', message: 'Insufficient permissions' })
  })

  it('does not grant admin implicitly: requireRole("agent") rejects admin', async () => {
    const token = await signTestToken({ sub: 'u1', role: 'admin' })
    const response = await authedGet('/agents-only', token)
    expect(response.status).toBe(403)
  })

  it('passes both declared roles in a multi-role allow-list and rejects the rest', async () => {
    const agent = await authedGet(
      '/agents-and-admins',
      await signTestToken({ sub: 'u1', role: 'agent' }),
    )
    const admin = await authedGet(
      '/agents-and-admins',
      await signTestToken({ sub: 'u2', role: 'admin' }),
    )
    const user = await authedGet(
      '/agents-and-admins',
      await signTestToken({ sub: 'u3', role: 'user' }),
    )
    expect(agent.status).toBe(200)
    expect(admin.status).toBe(200)
    expect(user.status).toBe(403)
  })

  it('returns 401, not 403, when mounted without requireAuth', async () => {
    const response = await createGuardApp().request('/role-without-auth')
    expect(response.status).toBe(401)
  })
})
