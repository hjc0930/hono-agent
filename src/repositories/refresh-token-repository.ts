import { and, eq, isNull } from 'drizzle-orm'

import type { Database } from '../db/client.ts'
import { getDatabase } from '../db/client.ts'
import { refreshTokens } from '../db/schema.ts'

export type NewRefreshToken = {
  userId: string
  tokenHash: string
  expiresAt: Date
}

export type RefreshTokenRecord = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}

export interface RefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>
  insert(token: NewRefreshToken): Promise<RefreshTokenRecord>
  /** Marks the token revoked; returns false when it was already revoked. */
  revoke(id: string): Promise<boolean>
  revokeAllForUser(userId: string): Promise<void>
}

export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  readonly #loadDatabase: () => Database

  constructor(loadDatabase: () => Database = getDatabase) {
    this.#loadDatabase = loadDatabase
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const rows = await this.#loadDatabase()
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)
    return rows[0] ?? null
  }

  async insert(token: NewRefreshToken): Promise<RefreshTokenRecord> {
    const rows = await this.#loadDatabase().insert(refreshTokens).values(token).returning()
    const inserted = rows[0]
    if (!inserted) throw new Error('refresh token insert returned no rows')
    return inserted
  }

  // Conditional update: only an active row transitions, so concurrent refreshes
  // with the same token cannot both win.
  async revoke(id: string): Promise<boolean> {
    const updated = await this.#loadDatabase()
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id })
    return updated.length > 0
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.#loadDatabase()
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
  }
}
