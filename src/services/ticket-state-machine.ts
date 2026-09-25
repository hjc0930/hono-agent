import { forbiddenError, invalidStateTransitionError, ticketNotFoundError } from '../lib/errors.ts'
import type { TicketEventRepository } from '../repositories/ticket-event-repository.ts'
import type {
  TicketPatch,
  TicketRecord,
  TicketRepository,
} from '../repositories/ticket-repository.ts'
import type { TicketStatus } from '../types.ts'
import type { ActorContext, PublicTicket } from './ticket.ts'
import { toPublicTicket } from './ticket.ts'

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
}

const isTransitionAllowedForRole = (
  from: TicketStatus,
  to: TicketStatus,
  ticket: TicketRecord,
  actor: ActorContext,
): boolean => {
  if (actor.role === 'admin') return true
  // Reopen (resolved -> in_progress) is the requester's pushback.
  if (from === 'resolved' && to === 'in_progress') return actor.userId === ticket.requesterId
  if (to === 'in_progress' || to === 'resolved') return actor.role === 'agent'
  if (to === 'cancelled' || to === 'closed') return actor.userId === ticket.requesterId
  return false
}

export type TicketStateMachine = {
  transition(input: {
    ticketId: string
    to: TicketStatus
    actor: ActorContext
  }): Promise<PublicTicket>
}

export const createTicketStateMachine = (dependencies: {
  ticketRepository: TicketRepository
  ticketEventRepository: TicketEventRepository
}): TicketStateMachine => {
  const { ticketRepository, ticketEventRepository } = dependencies

  return {
    async transition(input) {
      const ticket = await ticketRepository.findById(input.ticketId)
      if (!ticket) throw ticketNotFoundError()

      const from = ticket.status
      if (!ALLOWED_TRANSITIONS[from].includes(input.to)) throw invalidStateTransitionError()
      if (!isTransitionAllowedForRole(from, input.to, ticket, input.actor)) throw forbiddenError()
      if (input.to === 'resolved' && ticket.handlerId === null) throw invalidStateTransitionError()

      const patch: TicketPatch = { status: input.to }
      if (input.to === 'resolved') patch.resolvedAt = new Date()
      if (input.to === 'closed') patch.closedAt = new Date()

      const updated = await ticketRepository.update(ticket.id, patch)
      if (!updated) throw ticketNotFoundError()

      await ticketEventRepository.insert({
        ticketId: ticket.id,
        actorId: input.actor.userId,
        fromStatus: from,
        toStatus: input.to,
      })

      return toPublicTicket(updated)
    },
  }
}
