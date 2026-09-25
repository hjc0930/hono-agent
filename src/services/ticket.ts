import { forbiddenError, invalidCategoryError, ticketNotFoundError } from '../lib/errors.ts'
import type { TicketCategoryRepository } from '../repositories/ticket-category-repository.ts'
import type {
  TicketListFilter,
  TicketRecord,
  TicketRepository,
} from '../repositories/ticket-repository.ts'
import type { TicketPriority, TicketStatus, UserRole } from '../types.ts'

export type PublicTicket = {
  id: string
  title: string
  description: string
  categoryId: string
  priority: TicketPriority
  status: TicketStatus
  requesterId: string
  handlerId: string | null
  createdAt: Date
  updatedAt: Date
}

export type ActorContext = {
  userId: string
  role: UserRole
}

export const toPublicTicket = (ticket: TicketRecord): PublicTicket => ({
  id: ticket.id,
  title: ticket.title,
  description: ticket.description,
  categoryId: ticket.categoryId,
  priority: ticket.priority,
  status: ticket.status,
  requesterId: ticket.requesterId,
  handlerId: ticket.handlerId,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
})

export type CreateTicketInput = {
  title: string
  description: string
  categoryId: string
  priority?: TicketPriority
  requesterId?: string
}

export type TicketService = {
  create(input: CreateTicketInput, actor: ActorContext): Promise<PublicTicket>
  list(
    filter: TicketListFilter,
    actor: ActorContext,
  ): Promise<{ items: PublicTicket[]; total: number }>
  get(id: string, actor: ActorContext): Promise<PublicTicket>
}

export const createTicketService = (dependencies: {
  ticketRepository: TicketRepository
  ticketCategoryRepository: TicketCategoryRepository
}): TicketService => {
  const { ticketRepository, ticketCategoryRepository } = dependencies

  return {
    async create(input, actor) {
      const category = await ticketCategoryRepository.findById(input.categoryId)
      if (!category || !category.enabled) throw invalidCategoryError()

      const requesterId = input.requesterId ?? actor.userId
      if (actor.role === 'user' && requesterId !== actor.userId) throw forbiddenError()

      const created = await ticketRepository.insert({
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        priority: input.priority ?? 'medium',
        status: 'pending',
        requesterId,
        handlerId: null,
      })
      return toPublicTicket(created)
    },

    async list(filter, actor) {
      const effectiveFilter: TicketListFilter =
        actor.role === 'user' ? { ...filter, requesterId: actor.userId } : filter
      const { items, total } = await ticketRepository.list(effectiveFilter)
      return { items: items.map(toPublicTicket), total }
    },

    async get(id, actor) {
      const ticket = await ticketRepository.findById(id)
      if (!ticket) throw ticketNotFoundError()
      if (actor.role === 'user' && ticket.requesterId !== actor.userId) throw forbiddenError()
      return toPublicTicket(ticket)
    },
  }
}
