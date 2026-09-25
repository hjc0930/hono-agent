import { describe, expect, it } from 'vitest'

import {
  MemoryTicketEventRepository,
  MemoryTicketRepository,
  MemoryUserRepository,
  makeTicket,
  makeUser,
} from '../repositories/fakes.ts'
import { createTicketAssignmentService } from './ticket-assignment.ts'
import type { ActorContext } from './ticket.ts'

const setup = (ticketOverrides: Partial<ReturnType<typeof makeTicket>> = {}) => {
  const ticketRepository = new MemoryTicketRepository([
    makeTicket({ id: 't-1', ...ticketOverrides }),
  ])
  const ticketEventRepository = new MemoryTicketEventRepository()
  const userRepository = new MemoryUserRepository([
    makeUser({ id: 'agent-1', username: 'agent1', role: 'agent', status: 'active' }),
    makeUser({ id: 'customer-1', username: 'customer', role: 'user', status: 'active' }),
    makeUser({ id: 'disabled-agent', username: 'disabled', role: 'agent', status: 'disabled' }),
  ])
  const service = createTicketAssignmentService({
    ticketRepository,
    ticketEventRepository,
    userRepository,
  })
  return { service, ticketEventRepository }
}

const admin: ActorContext = { userId: 'admin-1', role: 'admin' }

const errorFields = async (run: () => Promise<unknown>) => {
  try {
    await run()
    throw new Error('expected the call to throw')
  } catch (error) {
    const appError = error as { status?: number; code?: string }
    return { status: appError.status, code: appError.code }
  }
}

describe('TicketAssignmentService.assign', () => {
  it('assigns a pending ticket and advances it to in_progress', async () => {
    const { service, ticketEventRepository } = setup({ status: 'pending' })
    const result = await service.assign({ ticketId: 't-1', handlerId: 'agent-1', actor: admin })
    expect(result).toMatchObject({ handlerId: 'agent-1', status: 'in_progress' })
    const events = await ticketEventRepository.listByTicket('t-1')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ fromStatus: 'pending', toStatus: 'in_progress' })
  })

  it('reassigns an in_progress ticket without changing status', async () => {
    const { service } = setup({ status: 'in_progress', handlerId: 'old-agent' })
    const result = await service.assign({ ticketId: 't-1', handlerId: 'agent-1', actor: admin })
    expect(result).toMatchObject({ handlerId: 'agent-1', status: 'in_progress' })
  })

  it('rejects assigning to a user role', async () => {
    const { service } = setup({ status: 'pending' })
    const result = await errorFields(() =>
      service.assign({ ticketId: 't-1', handlerId: 'customer-1', actor: admin }),
    )
    expect(result).toEqual({ status: 400, code: 'INVALID_HANDLER' })
  })

  it('rejects assigning to a disabled agent', async () => {
    const { service } = setup({ status: 'pending' })
    const result = await errorFields(() =>
      service.assign({ ticketId: 't-1', handlerId: 'disabled-agent', actor: admin }),
    )
    expect(result).toEqual({ status: 400, code: 'INVALID_HANDLER' })
  })

  it('rejects assigning a terminal ticket', async () => {
    const { service } = setup({ status: 'closed' })
    const result = await errorFields(() =>
      service.assign({ ticketId: 't-1', handlerId: 'agent-1', actor: admin }),
    )
    expect(result).toEqual({ status: 400, code: 'INVALID_STATE_TRANSITION' })
  })
})
