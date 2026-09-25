import { asc, eq } from 'drizzle-orm'

import type { Database } from '../db/client.ts'
import { getDatabase } from '../db/client.ts'
import { ticketComments } from '../db/schema.ts'
import type { CommentKind } from '../types.ts'

export type NewTicketComment = {
  ticketId: string
  authorId: string
  body: string
  kind: CommentKind
}

export type TicketCommentRecord = {
  id: string
  ticketId: string
  authorId: string
  body: string
  kind: CommentKind
  createdAt: Date
}

export interface TicketCommentRepository {
  insert(comment: NewTicketComment): Promise<TicketCommentRecord>
  listByTicket(ticketId: string): Promise<TicketCommentRecord[]>
}

export class DrizzleTicketCommentRepository implements TicketCommentRepository {
  readonly #loadDatabase: () => Database

  constructor(loadDatabase: () => Database = getDatabase) {
    this.#loadDatabase = loadDatabase
  }

  async insert(comment: NewTicketComment): Promise<TicketCommentRecord> {
    const rows = await this.#loadDatabase().insert(ticketComments).values(comment).returning()
    const inserted = rows[0]
    if (!inserted) throw new Error('ticket comment insert returned no rows')
    return inserted
  }

  async listByTicket(ticketId: string): Promise<TicketCommentRecord[]> {
    return this.#loadDatabase()
      .select()
      .from(ticketComments)
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(asc(ticketComments.createdAt))
  }
}
