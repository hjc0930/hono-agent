import { eq } from 'drizzle-orm'

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

export interface UserRepository {
  findByUsername(username: string): Promise<UserRecord | null>
  findById(id: string): Promise<UserRecord | null>
  insert(user: NewUser): Promise<UserRecord>
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
}
