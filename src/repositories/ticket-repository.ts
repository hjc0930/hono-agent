import { and, count, desc, eq, gte, ilike, lte, or } from 'drizzle-orm'

import type { Database } from '../db/client.ts'
import { getDatabase } from '../db/client.ts'
import { tickets } from '../db/schema.ts'
import type { TicketPriority, TicketStatus } from '../types.ts'

export type NewTicket = {
  title: string
  description: string
  categoryId: string
  priority: TicketPriority
  status: TicketStatus
  requesterId: string
  handlerId: string | null
}

export type TicketRecord = {
  id: string
  title: string
  description: string
  categoryId: string
  priority: TicketPriority
  status: TicketStatus
  requesterId: string
  handlerId: string | null
  resolvedAt: Date | null
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type TicketListFilter = {
  page: number
  pageSize: number
  status?: TicketStatus
  priority?: TicketPriority
  categoryId?: string
  requesterId?: string
  handlerId?: string
  keyword?: string
  createdFrom?: Date
  createdTo?: Date
}

export type TicketPatch = {
  status?: TicketStatus
  handlerId?: string | null
  resolvedAt?: Date | null
  closedAt?: Date | null
}

export interface TicketRepository {
  list(filter: TicketListFilter): Promise<{ items: TicketRecord[]; total: number }>
  findById(id: string): Promise<TicketRecord | null>
  insert(ticket: NewTicket): Promise<TicketRecord>
  update(id: string, patch: TicketPatch): Promise<TicketRecord | null>
}

export class DrizzleTicketRepository implements TicketRepository {
  readonly #loadDatabase: () => Database

  constructor(loadDatabase: () => Database = getDatabase) {
    this.#loadDatabase = loadDatabase
  }

  async list(filter: TicketListFilter): Promise<{ items: TicketRecord[]; total: number }> {
    const conditions = []
    if (filter.status !== undefined) conditions.push(eq(tickets.status, filter.status))
    if (filter.priority !== undefined) conditions.push(eq(tickets.priority, filter.priority))
    if (filter.categoryId !== undefined) conditions.push(eq(tickets.categoryId, filter.categoryId))
    if (filter.requesterId !== undefined)
      conditions.push(eq(tickets.requesterId, filter.requesterId))
    if (filter.handlerId !== undefined) conditions.push(eq(tickets.handlerId, filter.handlerId))
    if (filter.createdFrom !== undefined)
      conditions.push(gte(tickets.createdAt, filter.createdFrom))
    if (filter.createdTo !== undefined) conditions.push(lte(tickets.createdAt, filter.createdTo))
    if (filter.keyword !== undefined && filter.keyword.length > 0) {
      const pattern = `%${filter.keyword}%`
      conditions.push(or(ilike(tickets.title, pattern), ilike(tickets.description, pattern)))
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const db = this.#loadDatabase()
    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(tickets)
        .where(where)
        .orderBy(desc(tickets.createdAt))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      db.select({ value: count() }).from(tickets).where(where),
    ])

    return { items: rows, total: Number(countRows[0]?.value ?? 0) }
  }

  async findById(id: string): Promise<TicketRecord | null> {
    const rows = await this.#loadDatabase()
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async insert(ticket: NewTicket): Promise<TicketRecord> {
    const rows = await this.#loadDatabase().insert(tickets).values(ticket).returning()
    const inserted = rows[0]
    if (!inserted) throw new Error('ticket insert returned no rows')
    return inserted
  }

  async update(id: string, patch: TicketPatch): Promise<TicketRecord | null> {
    const rows = await this.#loadDatabase()
      .update(tickets)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning()
    return rows[0] ?? null
  }
}
