import { describe, expect, it } from 'vitest'

import { signAccessToken } from '../lib/access-token.ts'
import {
  MemoryTicketCategoryRepository,
  MemoryTicketCommentRepository,
  MemoryTicketEventRepository,
  MemoryTicketRepository,
  MemoryUserRepository,
  makeTicket,
  makeTicketCategory,
  makeUser,
} from '../repositories/fakes.ts'
import { createApp } from '../main.ts'

const buildApp = async () => {
  const ticketRepository = new MemoryTicketRepository([
    makeTicket({ id: 't-1', requesterId: 'requester-1', title: '登录失败' }),
  ])
  const ticketCategoryRepository = new MemoryTicketCategoryRepository([
    makeTicketCategory({ id: 'cat-1', name: '账号问题', enabled: true }),
  ])
  const ticketEventRepository = new MemoryTicketEventRepository()
  const ticketCommentRepository = new MemoryTicketCommentRepository()
  const userRepository = new MemoryUserRepository([
    makeUser({ id: 'agent-1', username: 'agent1', role: 'agent', status: 'active' }),
  ])
  const app = createApp({
    ticketRepository,
    ticketCategoryRepository,
    ticketEventRepository,
    ticketCommentRepository,
    userRepository,
  })
  const requesterToken = await signAccessToken({ sub: 'requester-1', role: 'user' })
  const agentToken = await signAccessToken({ sub: 'agent-1', role: 'agent' })
  const adminToken = await signAccessToken({ sub: 'admin-1', role: 'admin' })
  return { app, requesterToken, agentToken, adminToken, ticketRepository }
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })
const jsonHeaders = { 'content-type': 'application/json' }

describe('POST /api/tickets', () => {
  it('creates a ticket', async () => {
    const { app, requesterToken } = await buildApp()
    const response = await app.request('/api/tickets', {
      method: 'POST',
      headers: { ...authed(requesterToken), ...jsonHeaders },
      body: JSON.stringify({ title: '新工单', description: '描述', categoryId: 'cat-1' }),
    })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      title: '新工单',
      status: 'pending',
      requesterId: 'requester-1',
    })
  })

  it('rejects an invalid category', async () => {
    const { app, requesterToken } = await buildApp()
    const response = await app.request('/api/tickets', {
      method: 'POST',
      headers: { ...authed(requesterToken), ...jsonHeaders },
      body: JSON.stringify({ title: 'x', description: 'y', categoryId: 'nope' }),
    })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('INVALID_CATEGORY')
  })
})

describe('GET /api/tickets visibility', () => {
  it('a requester only sees their own tickets', async () => {
    const { app, requesterToken, ticketRepository } = await buildApp()
    await ticketRepository.insert({
      title: 'other',
      description: 'x',
      categoryId: 'cat-1',
      priority: 'medium',
      status: 'pending',
      requesterId: 'someone-else',
      handlerId: null,
    })

    const response = await app.request('/api/tickets', { headers: authed(requesterToken) })
    const body = await response.json()
    expect(body.meta.total).toBe(1)
    expect(body.data[0]?.requesterId).toBe('requester-1')
  })

  it('an agent sees all tickets', async () => {
    const { app, agentToken } = await buildApp()
    const response = await app.request('/api/tickets', { headers: authed(agentToken) })
    const body = await response.json()
    expect(body.meta.total).toBe(1)
  })
})

describe('POST /api/tickets/:id/transition', () => {
  it('an agent resolves an assigned ticket', async () => {
    const { app, agentToken, ticketRepository } = await buildApp()
    await ticketRepository.update('t-1', { handlerId: 'agent-1', status: 'in_progress' })

    const response = await app.request('/api/tickets/t-1/transition', {
      method: 'POST',
      headers: { ...authed(agentToken), ...jsonHeaders },
      body: JSON.stringify({ to: 'resolved' }),
    })
    expect(response.status).toBe(200)
    expect((await response.json()).data.status).toBe('resolved')
  })

  it('rejects a requester advancing to in_progress', async () => {
    const { app, requesterToken } = await buildApp()
    const response = await app.request('/api/tickets/t-1/transition', {
      method: 'POST',
      headers: { ...authed(requesterToken), ...jsonHeaders },
      body: JSON.stringify({ to: 'in_progress' }),
    })
    expect(response.status).toBe(403)
  })
})

describe('POST /api/tickets/:id/assign', () => {
  it('admin assigns a pending ticket', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.request('/api/tickets/t-1/assign', {
      method: 'POST',
      headers: { ...authed(adminToken), ...jsonHeaders },
      body: JSON.stringify({ handlerId: 'agent-1' }),
    })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({ handlerId: 'agent-1', status: 'in_progress' })
  })

  it('rejects a non-admin', async () => {
    const { app, agentToken } = await buildApp()
    const response = await app.request('/api/tickets/t-1/assign', {
      method: 'POST',
      headers: { ...authed(agentToken), ...jsonHeaders },
      body: JSON.stringify({ handlerId: 'agent-1' }),
    })
    expect(response.status).toBe(403)
  })
})

describe('ticket comments', () => {
  it('an agent posts an internal note the requester cannot see', async () => {
    const { app, agentToken, requesterToken } = await buildApp()

    const post = await app.request('/api/tickets/t-1/comments', {
      method: 'POST',
      headers: { ...authed(agentToken), ...jsonHeaders },
      body: JSON.stringify({ body: '内部备注', kind: 'internal' }),
    })
    expect(post.status).toBe(200)

    const listAsAgent = await app.request('/api/tickets/t-1/comments', {
      headers: authed(agentToken),
    })
    expect((await listAsAgent.json()).data).toHaveLength(1)

    const listAsRequester = await app.request('/api/tickets/t-1/comments', {
      headers: authed(requesterToken),
    })
    expect((await listAsRequester.json()).data).toHaveLength(0)
  })
})
