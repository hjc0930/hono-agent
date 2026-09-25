import { describe, expect, it } from 'vitest'

import { signAccessToken } from '../lib/access-token.ts'
import { MemoryTicketCategoryRepository, makeTicketCategory } from '../repositories/fakes.ts'
import { createApp } from '../main.ts'

const buildApp = async () => {
  const ticketCategoryRepository = new MemoryTicketCategoryRepository([
    makeTicketCategory({ name: '账号问题' }),
  ])
  const app = createApp({ ticketCategoryRepository })
  const adminToken = await signAccessToken({ sub: 'admin-1', role: 'admin' })
  const userToken = await signAccessToken({ sub: 'user-1', role: 'user' })
  return { app, ticketCategoryRepository, adminToken, userToken }
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })
const jsonHeaders = { 'content-type': 'application/json' }

describe('ticket category routes — authorization', () => {
  it('requires authentication', async () => {
    const { app } = await buildApp()
    const response = await app.request('/api/ticket-categories')
    expect(response.status).toBe(401)
  })

  it('rejects non-admin writes with 403', async () => {
    const { app, userToken } = await buildApp()
    const response = await app.request('/api/ticket-categories', {
      method: 'POST',
      headers: { ...authed(userToken), ...jsonHeaders },
      body: JSON.stringify({ name: '新分类' }),
    })
    expect(response.status).toBe(403)
  })

  it('allows any authenticated user to read', async () => {
    const { app, userToken } = await buildApp()
    const response = await app.request('/api/ticket-categories', { headers: authed(userToken) })
    expect(response.status).toBe(200)
  })
})

describe('POST /api/ticket-categories', () => {
  it('creates a category', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.request('/api/ticket-categories', {
      method: 'POST',
      headers: { ...authed(adminToken), ...jsonHeaders },
      body: JSON.stringify({ name: '设备故障' }),
    })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({ name: '设备故障', enabled: true })
  })

  it('rejects a duplicate name', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.request('/api/ticket-categories', {
      method: 'POST',
      headers: { ...authed(adminToken), ...jsonHeaders },
      body: JSON.stringify({ name: '账号问题' }),
    })
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('CATEGORY_NAME_TAKEN')
  })
})

describe('GET /api/ticket-categories', () => {
  it('returns paginated results with meta', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.request('/api/ticket-categories?page=1&pageSize=10', {
      headers: authed(adminToken),
    })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.meta).toMatchObject({ page: 1, pageSize: 10, total: 1, totalPages: 1 })
  })
})

describe('GET /api/ticket-categories/:id', () => {
  it('returns a category or 404', async () => {
    const { app, adminToken, ticketCategoryRepository } = await buildApp()
    const existing = await ticketCategoryRepository.findByName('账号问题')
    const found = await app.request(`/api/ticket-categories/${existing!.id}`, {
      headers: authed(adminToken),
    })
    expect(found.status).toBe(200)

    const missing = await app.request('/api/ticket-categories/missing', {
      headers: authed(adminToken),
    })
    expect(missing.status).toBe(404)
    expect((await missing.json()).code).toBe('CATEGORY_NOT_FOUND')
  })
})

describe('PATCH /api/ticket-categories/:id', () => {
  it('updates a category and rejects an empty body', async () => {
    const { app, adminToken, ticketCategoryRepository } = await buildApp()
    const existing = await ticketCategoryRepository.findByName('账号问题')

    const update = await app.request(`/api/ticket-categories/${existing!.id}`, {
      method: 'PATCH',
      headers: { ...authed(adminToken), ...jsonHeaders },
      body: JSON.stringify({ enabled: false, description: '登录相关' }),
    })
    expect(update.status).toBe(200)
    expect((await update.json()).data).toMatchObject({ enabled: false, description: '登录相关' })

    const empty = await app.request(`/api/ticket-categories/${existing!.id}`, {
      method: 'PATCH',
      headers: { ...authed(adminToken), ...jsonHeaders },
      body: JSON.stringify({}),
    })
    expect(empty.status).toBe(400)
  })
})
