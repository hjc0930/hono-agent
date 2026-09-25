import { asc, eq } from 'drizzle-orm'

import type { Database } from '../db/client.ts'
import { getDatabase } from '../db/client.ts'
import { ticketEvents } from '../db/schema.ts'
import type { TicketStatus } from '../types.ts'

export type NewTicketEvent = {
  ticketId: string
  actorId: string
  fromStatus: TicketStatus
  toStatus: TicketStatus
}

export type TicketEventRecord = {
  id: string
  ticketId: string
  actorId: string
  fromStatus: TicketStatus
  toStatus: TicketStatus
  createdAt: Date
}

export interface TicketEventRepository {
  insert(event: NewTicketEvent): Promise<TicketEventRecord>
  listByTicket(ticketId: string): Promise<TicketEventRecord[]>
}

export class DrizzleTicketEventRepository implements TicketEventRepository {
  readonly #loadDatabase: () => Database

  constructor(loadDatabase: () => Database = getDatabase) {
    this.#loadDatabase = loadDatabase
  }

  async insert(event: NewTicketEvent): Promise<TicketEventRecord> {
    const rows = await this.#loadDatabase().insert(ticketEvents).values(event).returning()
    const inserted = rows[0]
    if (!inserted) throw new Error('ticket event insert returned no rows')
    return inserted
  }

  async listByTicket(ticketId: string): Promise<TicketEventRecord[]> {
    return this.#loadDatabase()
      .select()
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, ticketId))
      .orderBy(asc(ticketEvents.createdAt))
  }
}
