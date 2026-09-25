import { describe, expect, it } from 'vitest'

import {
  MemoryTicketEventRepository,
  MemoryTicketRepository,
  makeTicket,
} from '../repositories/fakes.ts'
import type { TicketStatus } from '../types.ts'
import { ALLOWED_TRANSITIONS, createTicketStateMachine } from './ticket-state-machine.ts'
import type { ActorContext } from './ticket.ts'

const ALL_STATUSES: TicketStatus[] = ['pending', 'in_progress', 'resolved', 'closed', 'cancelled']

const setup = (overrides: Partial<ReturnType<typeof makeTicket>> = {}) => {
  const ticketRepository = new MemoryTicketRepository([
    makeTicket({ id: 't-1', requesterId: 'requester-1', handlerId: 'handler-1', ...overrides }),
  ])
  const ticketEventRepository = new MemoryTicketEventRepository()
  const stateMachine = createTicketStateMachine({ ticketRepository, ticketEventRepository })
  return { stateMachine, ticketEventRepository }
}

const actor = (role: ActorContext['role'], userId = 'actor-1'): ActorContext => ({ userId, role })

const errorFields = async (run: () => Promise<unknown>) => {
  try {
    await run()
    throw new Error('expected the call to throw')
  } catch (error) {
    const appError = error as { status?: number; code?: string }
    return { status: appError.status, code: appError.code }
  }
}

describe('state machine — legal transitions', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALLOWED_TRANSITIONS[from]) {
      it(`${from} -> ${to} succeeds`, async () => {
        const { stateMachine, ticketEventRepository } = setup({ status: from })
        const result = await stateMachine.transition({ ticketId: 't-1', to, actor: actor('admin') })
        expect(result.status).toBe(to)
        const events = await ticketEventRepository.listByTicket('t-1')
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({ fromStatus: from, toStatus: to })
      })
    }
  }
})

describe('state machine — illegal transitions', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      if (ALLOWED_TRANSITIONS[from].includes(to)) continue
      it(`${from} -> ${to} rejected`, async () => {
        const { stateMachine } = setup({ status: from })
        const result = await errorFields(() =>
          stateMachine.transition({ ticketId: 't-1', to, actor: actor('admin') }),
        )
        expect(result).toEqual({ status: 400, code: 'INVALID_STATE_TRANSITION' })
      })
    }
  }
})

describe('state machine — role gating', () => {
  it('rejects a requester advancing to in_progress or resolved', async () => {
    const { stateMachine } = setup({ status: 'pending' })
    const toInProgress = await errorFields(() =>
      stateMachine.transition({
        ticketId: 't-1',
        to: 'in_progress',
        actor: actor('user', 'requester-1'),
      }),
    )
    expect(toInProgress).toEqual({ status: 403, code: 'FORBIDDEN' })
  })

  it('allows an agent to resolve', async () => {
    const { stateMachine } = setup({ status: 'in_progress' })
    const result = await stateMachine.transition({
      ticketId: 't-1',
      to: 'resolved',
      actor: actor('agent'),
    })
    expect(result.status).toBe('resolved')
  })

  it('allows the requester to cancel and reopen', async () => {
    const { stateMachine } = setup({ status: 'pending' })
    const cancelled = await stateMachine.transition({
      ticketId: 't-1',
      to: 'cancelled',
      actor: actor('user', 'requester-1'),
    })
    expect(cancelled.status).toBe('cancelled')

    const reopenSetup = setup({ status: 'resolved' })
    const reopened = await reopenSetup.stateMachine.transition({
      ticketId: 't-1',
      to: 'in_progress',
      actor: actor('user', 'requester-1'),
    })
    expect(reopened.status).toBe('in_progress')
  })
})

describe('state machine — resolved requires a handler', () => {
  it('rejects resolving an unassigned ticket', async () => {
    const { stateMachine } = setup({ status: 'in_progress', handlerId: null })
    const result = await errorFields(() =>
      stateMachine.transition({ ticketId: 't-1', to: 'resolved', actor: actor('agent') }),
    )
    expect(result).toEqual({ status: 400, code: 'INVALID_STATE_TRANSITION' })
  })
})
