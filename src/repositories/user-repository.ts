import { and, asc, count, eq, ilike, or } from 'drizzle-orm'

import type { Database } from '../db/client.ts'
import { getDatabase } from '../db/client.ts'
import { users } from '../db/schema.ts'
import type { UserStatus, UserRole } from '../types.ts'

export type NewUser = {
  username: string
  passwordHash: string
  displayName: string | null
  role: UserRole
  status: UserStatus
}

export type UserRecord = {
  id: string
  username: string
  passwordHash: string
  displayName: string | null
  role: UserRole
  status: UserStatus
  createdAt: Date
  updatedAt: Date
}

export type UserListFilter = {
  page: number
  pageSize: number
  role?: UserRole
  status?: UserStatus
  keyword?: string
}

export type UserPatch = {
  displayName?: string | null
  role?: UserRole
  status?: UserStatus
  passwordHash?: string
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserRecord | null>
  findById(id: string): Promise<UserRecord | null>
  insert(user: NewUser): Promise<UserRecord>
  list(filter: UserListFilter): Promise<{ items: UserRecord[]; total: number }>
  update(id: string, patch: UserPatch): Promise<UserRecord | null>
}

export class DrizzleUserRepository implements UserRepository {
  readonly #loadDatabase: () => Database

  constructor(loadDatabase: () => Database = getDatabase) {
    this.#loadDatabase = loadDatabase
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const rows = await this.#loadDatabase()
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1)
    return rows[0] ?? null
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.#loadDatabase().select().from(users).where(eq(users.id, id)).limit(1)
    return rows[0] ?? null
  }

  async insert(user: NewUser): Promise<UserRecord> {
    const rows = await this.#loadDatabase().insert(users).values(user).returning()
    const inserted = rows[0]
    if (!inserted) throw new Error('user insert returned no rows')
    return inserted
  }

  async list(filter: UserListFilter): Promise<{ items: UserRecord[]; total: number }> {
    const conditions = []
    if (filter.role !== undefined) conditions.push(eq(users.role, filter.role))
    if (filter.status !== undefined) conditions.push(eq(users.status, filter.status))
    if (filter.keyword !== undefined && filter.keyword.length > 0) {
      const pattern = `%${filter.keyword}%`
      conditions.push(or(ilike(users.username, pattern), ilike(users.displayName, pattern)))
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const db = this.#loadDatabase()
    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(users)
        .where(where)
        .orderBy(asc(users.createdAt))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      db.select({ value: count() }).from(users).where(where),
    ])

    return { items: rows, total: Number(countRows[0]?.value ?? 0) }
  }

  async update(id: string, patch: UserPatch): Promise<UserRecord | null> {
    const rows = await this.#loadDatabase()
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    return rows[0] ?? null
  }
}
