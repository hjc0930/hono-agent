import { describe, expect, it } from 'vitest'

import {
  MemoryTicketCategoryRepository,
  MemoryTicketRepository,
  makeTicket,
  makeTicketCategory,
} from '../repositories/fakes.ts'
import { createTicketService } from './ticket.ts'
import type { ActorContext } from './ticket.ts'

const setup = () => {
  const ticketRepository = new MemoryTicketRepository()
  const ticketCategoryRepository = new MemoryTicketCategoryRepository([
    makeTicketCategory({ id: 'cat-1', name: '账号问题', enabled: true }),
    makeTicketCategory({ id: 'cat-disabled', name: '停用分类', enabled: false }),
  ])
  const service = createTicketService({ ticketRepository, ticketCategoryRepository })
  return { service, ticketRepository }
}

const userActor = (id = 'user-1'): ActorContext => ({ userId: id, role: 'user' })
const agentActor = (id = 'agent-1'): ActorContext => ({ userId: id, role: 'agent' })
const adminActor = (id = 'admin-1'): ActorContext => ({ userId: id, role: 'admin' })

const errorFields = async (run: () => Promise<unknown>) => {
  try {
    await run()
    throw new Error('expected the call to throw')
  } catch (error) {
    const appError = error as { status?: number; code?: string }
    return { status: appError.status, code: appError.code }
  }
}

describe('TicketService.create', () => {
  it('creates a pending ticket with the actor as requester', async () => {
    const { service } = setup()
    const ticket = await service.create(
      { title: '登录失败', description: '无法登录', categoryId: 'cat-1' },
      userActor(),
    )
    expect(ticket).toMatchObject({ status: 'pending', requesterId: 'user-1', handlerId: null })
  })

  it('rejects a missing or disabled category', async () => {
    const { service } = setup()
    const missing = await errorFields(() =>
      service.create({ title: 'x', description: 'y', categoryId: 'nope' }, userActor()),
    )
    expect(missing).toEqual({ status: 400, code: 'INVALID_CATEGORY' })

    const disabled = await errorFields(() =>
      service.create({ title: 'x', description: 'y', categoryId: 'cat-disabled' }, userActor()),
    )
    expect(disabled).toEqual({ status: 400, code: 'INVALID_CATEGORY' })
  })

  it('lets an agent file on behalf of a customer but denies a user override', async () => {
    const { service } = setup()

    const asAgent = await service.create(
      { title: 'x', description: 'y', categoryId: 'cat-1', requesterId: 'customer-1' },
      agentActor(),
    )
    expect(asAgent.requesterId).toBe('customer-1')

    const asUser = await errorFields(() =>
      service.create(
        { title: 'x', description: 'y', categoryId: 'cat-1', requesterId: 'someone-else' },
        userActor(),
      ),
    )
    expect(asUser).toEqual({ status: 403, code: 'FORBIDDEN' })
  })
})

describe('TicketService.list visibility', () => {
  it('forces a user to their own tickets and lets agents see all', async () => {
    const ticketRepository = new MemoryTicketRepository([
      makeTicket({ requesterId: 'user-1', title: 'mine' }),
      makeTicket({ requesterId: 'user-2', title: 'theirs' }),
    ])
    const ticketCategoryRepository = new MemoryTicketCategoryRepository()
    const service = createTicketService({ ticketRepository, ticketCategoryRepository })

    const asUser = await service.list({ page: 1, pageSize: 20 }, userActor('user-1'))
    expect(asUser.total).toBe(1)
    expect(asUser.items[0]?.title).toBe('mine')

    const asAgent = await service.list({ page: 1, pageSize: 20 }, agentActor())
    expect(asAgent.total).toBe(2)
  })
})

describe('TicketService.get visibility', () => {
  it('denies a user reading another requester ticket', async () => {
    const ticketRepository = new MemoryTicketRepository([
      makeTicket({ id: 't-1', requesterId: 'user-2' }),
    ])
    const ticketCategoryRepository = new MemoryTicketCategoryRepository()
    const service = createTicketService({ ticketRepository, ticketCategoryRepository })

    const denied = await errorFields(() => service.get('t-1', userActor('user-1')))
    expect(denied).toEqual({ status: 403, code: 'FORBIDDEN' })

    const admin = await service.get('t-1', adminActor())
    expect(admin.id).toBe('t-1')
  })

  it('throws not found for a missing id', async () => {
    const { service } = setup()
    const result = await errorFields(() => service.get('missing', adminActor()))
    expect(result).toEqual({ status: 404, code: 'TICKET_NOT_FOUND' })
  })
})
