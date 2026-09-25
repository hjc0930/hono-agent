import { describe, expect, it } from 'vitest'

import {
  MemoryTicketCommentRepository,
  MemoryTicketRepository,
  makeTicket,
  makeTicketComment,
} from '../repositories/fakes.ts'
import { createTicketCommentService } from './ticket-comment.ts'
import type { ActorContext } from './ticket.ts'

const setup = () => {
  const ticketRepository = new MemoryTicketRepository([
    makeTicket({ id: 't-1', requesterId: 'requester-1' }),
  ])
  const ticketCommentRepository = new MemoryTicketCommentRepository()
  const service = createTicketCommentService({ ticketRepository, ticketCommentRepository })
  return { service, ticketCommentRepository }
}

const user = (id = 'requester-1'): ActorContext => ({ userId: id, role: 'user' })
const agent = (id = 'agent-1'): ActorContext => ({ userId: id, role: 'agent' })

const errorFields = async (run: () => Promise<unknown>) => {
  try {
    await run()
    throw new Error('expected the call to throw')
  } catch (error) {
    const appError = error as { status?: number; code?: string }
    return { status: appError.status, code: appError.code }
  }
}

describe('TicketCommentService.addComment', () => {
  it('adds a public comment for the requester', async () => {
    const { service } = setup()
    const comment = await service.addComment({
      ticketId: 't-1',
      body: '请补充截图',
      actor: user(),
    })
    expect(comment).toMatchObject({ body: '请补充截图', kind: 'public', authorId: 'requester-1' })
  })

  it('rejects a requester posting an internal note', async () => {
    const { service } = setup()
    const result = await errorFields(() =>
      service.addComment({ ticketId: 't-1', body: '内部', kind: 'internal', actor: user() }),
    )
    expect(result).toEqual({ status: 403, code: 'FORBIDDEN' })
  })

  it('allows an agent to post an internal note', async () => {
    const { service } = setup()
    const comment = await service.addComment({
      ticketId: 't-1',
      body: '内部排查中',
      kind: 'internal',
      actor: agent(),
    })
    expect(comment.kind).toBe('internal')
  })

  it('rejects a requester commenting on another ticket', async () => {
    const { service } = setup()
    const result = await errorFields(() =>
      service.addComment({ ticketId: 't-1', body: 'x', actor: user('other-user') }),
    )
    expect(result).toEqual({ status: 403, code: 'FORBIDDEN' })
  })
})

describe('TicketCommentService.listComments visibility', () => {
  it('hides internal comments from the requester', async () => {
    const ticketRepository = new MemoryTicketRepository([
      makeTicket({ id: 't-1', requesterId: 'requester-1' }),
    ])
    const ticketCommentRepository = new MemoryTicketCommentRepository([
      makeTicketComment({ ticketId: 't-1', kind: 'public', body: '对外' }),
      makeTicketComment({ ticketId: 't-1', kind: 'internal', body: '内部' }),
    ])
    const service = createTicketCommentService({ ticketRepository, ticketCommentRepository })

    const asRequester = await service.listComments({ ticketId: 't-1', actor: user() })
    expect(asRequester).toHaveLength(1)
    expect(asRequester[0]?.kind).toBe('public')

    const asAgent = await service.listComments({ ticketId: 't-1', actor: agent() })
    expect(asAgent).toHaveLength(2)
  })

  it('denies a requester reading another ticket comments', async () => {
    const { service } = setup()
    const result = await errorFields(() =>
      service.listComments({ ticketId: 't-1', actor: user('other-user') }),
    )
    expect(result).toEqual({ status: 403, code: 'FORBIDDEN' })
  })
})
