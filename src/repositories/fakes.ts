import { randomUUID } from 'node:crypto'

import type {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from './refresh-token-repository.ts'
import type { NewUser, UserRecord, UserRepository } from './user-repository.ts'

export class MemoryUserRepository implements UserRepository {
  readonly #users = new Map<string, UserRecord>()

  constructor(seedUsers: UserRecord[] = []) {
    for (const user of seedUsers) this.#users.set(user.id, user)
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    for (const user of this.#users.values()) {
      if (user.username === username) return user
    }
    return null
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.#users.get(id) ?? null
  }

  async insert(user: NewUser): Promise<UserRecord> {
    const record: UserRecord = {
      id: randomUUID(),
      username: user.username,
      passwordHash: user.passwordHash,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.#users.set(record.id, record)
    return record
  }

  /** Test-only helper for mutating a stored user (e.g. toggling status mid-test). */
  setStatus(id: string, status: UserRecord['status']): void {
    const user = this.#users.get(id)
    if (user) this.#users.set(id, { ...user, status })
  }
}

export class MemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly #tokens = new Map<string, RefreshTokenRecord>()

  constructor(seedTokens: RefreshTokenRecord[] = []) {
    for (const token of seedTokens) this.#tokens.set(token.id, token)
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const token of this.#tokens.values()) {
      if (token.tokenHash === tokenHash) return token
    }
    return null
  }

  async insert(token: NewRefreshToken): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      id: randomUUID(),
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    }
    this.#tokens.set(record.id, record)
    return record
  }

  async revoke(id: string): Promise<boolean> {
    const token = this.#tokens.get(id)
    if (!token || token.revokedAt !== null) return false
    this.#tokens.set(id, { ...token, revokedAt: new Date() })
    return true
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [id, token] of this.#tokens) {
      if (token.userId === userId && token.revokedAt === null) {
        this.#tokens.set(id, { ...token, revokedAt: new Date() })
      }
    }
  }

  /** Test-only helper exposing stored rows for assertions. */
  all(): RefreshTokenRecord[] {
    return [...this.#tokens.values()]
  }
}

type UserOverrides = Partial<Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>>

export const makeUser = (overrides: UserOverrides = {}): UserRecord => ({
  id: randomUUID(),
  username: overrides.username ?? 'alice',
  passwordHash: overrides.passwordHash ?? 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
  displayName: overrides.displayName ?? null,
  role: overrides.role ?? 'user',
  status: overrides.status ?? 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
})

type RefreshTokenOverrides = Partial<Omit<RefreshTokenRecord, 'id' | 'createdAt'>>

export const makeRefreshToken = (overrides: RefreshTokenOverrides = {}): RefreshTokenRecord => ({
  id: randomUUID(),
  userId: overrides.userId ?? randomUUID(),
  tokenHash: overrides.tokenHash ?? 'a'.repeat(64),
  expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
  revokedAt: overrides.revokedAt ?? null,
  createdAt: new Date(),
})
