import {
  invalidHandlerError,
  invalidStateTransitionError,
  ticketNotFoundError,
} from '../lib/errors.ts'
import type { TicketEventRepository } from '../repositories/ticket-event-repository.ts'
import type { TicketPatch, TicketRepository } from '../repositories/ticket-repository.ts'
import type { UserRepository } from '../repositories/user-repository.ts'
import type { ActorContext, PublicTicket } from './ticket.ts'
import { toPublicTicket } from './ticket.ts'

export type TicketAssignmentService = {
  assign(input: { ticketId: string; handlerId: string; actor: ActorContext }): Promise<PublicTicket>
}

export const createTicketAssignmentService = (dependencies: {
  ticketRepository: TicketRepository
  ticketEventRepository: TicketEventRepository
  userRepository: UserRepository
}): TicketAssignmentService => {
  const { ticketRepository, ticketEventRepository, userRepository } = dependencies

  return {
    async assign(input) {
      const ticket = await ticketRepository.findById(input.ticketId)
      if (!ticket) throw ticketNotFoundError()

      const handler = await userRepository.findById(input.handlerId)
      if (!handler || handler.status !== 'active' || handler.role === 'user') {
        throw invalidHandlerError()
      }

      const fromStatus = ticket.status
      let patch: TicketPatch
      if (ticket.status === 'pending') {
        patch = { handlerId: input.handlerId, status: 'in_progress' }
      } else if (ticket.status === 'in_progress') {
        patch = { handlerId: input.handlerId }
      } else {
        // resolved, closed, or cancelled cannot be assigned.
        throw invalidStateTransitionError()
      }

      const updated = await ticketRepository.update(ticket.id, patch)
      if (!updated) throw ticketNotFoundError()

      if (fromStatus !== updated.status) {
        await ticketEventRepository.insert({
          ticketId: ticket.id,
          actorId: input.actor.userId,
          fromStatus,
          toStatus: updated.status,
        })
      }

      return toPublicTicket(updated)
    },
  }
}
