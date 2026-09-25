import { and, asc, count, eq, ilike, or } from 'drizzle-orm'

import type { Database } from '../db/client.ts'
import { getDatabase } from '../db/client.ts'
import { ticketCategories } from '../db/schema.ts'

export type NewTicketCategory = {
  name: string
  description: string | null
  enabled: boolean
}

export type TicketCategoryRecord = {
  id: string
  name: string
  description: string | null
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

export type TicketCategoryListFilter = {
  page: number
  pageSize: number
  enabled?: boolean
  keyword?: string
}

export type TicketCategoryPatch = {
  name?: string
  description?: string | null
  enabled?: boolean
}

export interface TicketCategoryRepository {
  list(filter: TicketCategoryListFilter): Promise<{ items: TicketCategoryRecord[]; total: number }>
  findById(id: string): Promise<TicketCategoryRecord | null>
  findByName(name: string): Promise<TicketCategoryRecord | null>
  insert(category: NewTicketCategory): Promise<TicketCategoryRecord>
  update(id: string, patch: TicketCategoryPatch): Promise<TicketCategoryRecord | null>
}

export class DrizzleTicketCategoryRepository implements TicketCategoryRepository {
  readonly #loadDatabase: () => Database

  constructor(loadDatabase: () => Database = getDatabase) {
    this.#loadDatabase = loadDatabase
  }

  async list(
    filter: TicketCategoryListFilter,
  ): Promise<{ items: TicketCategoryRecord[]; total: number }> {
    const conditions = []
    if (filter.enabled !== undefined) conditions.push(eq(ticketCategories.enabled, filter.enabled))
    if (filter.keyword !== undefined && filter.keyword.length > 0) {
      const pattern = `%${filter.keyword}%`
      conditions.push(
        or(ilike(ticketCategories.name, pattern), ilike(ticketCategories.description, pattern)),
      )
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const db = this.#loadDatabase()
    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(ticketCategories)
        .where(where)
        .orderBy(asc(ticketCategories.createdAt))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      db.select({ value: count() }).from(ticketCategories).where(where),
    ])

    return { items: rows, total: Number(countRows[0]?.value ?? 0) }
  }

  async findById(id: string): Promise<TicketCategoryRecord | null> {
    const rows = await this.#loadDatabase()
      .select()
      .from(ticketCategories)
      .where(eq(ticketCategories.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async findByName(name: string): Promise<TicketCategoryRecord | null> {
    const rows = await this.#loadDatabase()
      .select()
      .from(ticketCategories)
      .where(eq(ticketCategories.name, name))
      .limit(1)
    return rows[0] ?? null
  }

  async insert(category: NewTicketCategory): Promise<TicketCategoryRecord> {
    const rows = await this.#loadDatabase().insert(ticketCategories).values(category).returning()
    const inserted = rows[0]
    if (!inserted) throw new Error('ticket category insert returned no rows')
    return inserted
  }

  async update(id: string, patch: TicketCategoryPatch): Promise<TicketCategoryRecord | null> {
    const rows = await this.#loadDatabase()
      .update(ticketCategories)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(ticketCategories.id, id))
      .returning()
    return rows[0] ?? null
  }
}
