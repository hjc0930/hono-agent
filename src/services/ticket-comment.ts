import { forbiddenError, ticketNotFoundError } from '../lib/errors.ts'
import type {
  TicketCommentRecord,
  TicketCommentRepository,
} from '../repositories/ticket-comment-repository.ts'
import type { TicketRepository } from '../repositories/ticket-repository.ts'
import type { CommentKind } from '../types.ts'
import type { ActorContext } from './ticket.ts'

export type PublicComment = {
  id: string
  ticketId: string
  authorId: string
  body: string
  kind: CommentKind
  createdAt: Date
}

const toPublicComment = (comment: TicketCommentRecord): PublicComment => ({
  id: comment.id,
  ticketId: comment.ticketId,
  authorId: comment.authorId,
  body: comment.body,
  kind: comment.kind,
  createdAt: comment.createdAt,
})

export type TicketCommentService = {
  addComment(input: {
    ticketId: string
    body: string
    kind?: CommentKind
    actor: ActorContext
  }): Promise<PublicComment>
  listComments(input: { ticketId: string; actor: ActorContext }): Promise<PublicComment[]>
}

export const createTicketCommentService = (dependencies: {
  ticketRepository: TicketRepository
  ticketCommentRepository: TicketCommentRepository
}): TicketCommentService => {
  const { ticketRepository, ticketCommentRepository } = dependencies

  return {
    async addComment(input) {
      const ticket = await ticketRepository.findById(input.ticketId)
      if (!ticket) throw ticketNotFoundError()

      const kind = input.kind ?? 'public'
      if (input.actor.role === 'user') {
        if (ticket.requesterId !== input.actor.userId) throw forbiddenError()
        if (kind === 'internal') throw forbiddenError()
      }

      const created = await ticketCommentRepository.insert({
        ticketId: input.ticketId,
        authorId: input.actor.userId,
        body: input.body,
        kind,
      })
      return toPublicComment(created)
    },

    async listComments(input) {
      const ticket = await ticketRepository.findById(input.ticketId)
      if (!ticket) throw ticketNotFoundError()

      if (input.actor.role === 'user' && ticket.requesterId !== input.actor.userId) {
        throw forbiddenError()
      }

      const comments = await ticketCommentRepository.listByTicket(input.ticketId)
      const visible =
        input.actor.role === 'user'
          ? comments.filter((comment) => comment.kind === 'public')
          : comments

      return visible.map(toPublicComment)
    },
  }
}
