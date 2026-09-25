import { randomUUID } from 'node:crypto'

import type {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from './refresh-token-repository.ts'
import type {
  NewTicketCategory,
  TicketCategoryListFilter,
  TicketCategoryPatch,
  TicketCategoryRecord,
  TicketCategoryRepository,
} from './ticket-category-repository.ts'
import type {
  NewTicketComment,
  TicketCommentRecord,
  TicketCommentRepository,
} from './ticket-comment-repository.ts'
import type {
  NewTicketEvent,
  TicketEventRecord,
  TicketEventRepository,
} from './ticket-event-repository.ts'
import type {
  NewTicket,
  TicketListFilter,
  TicketPatch,
  TicketRecord,
  TicketRepository,
} from './ticket-repository.ts'
import type {
  NewUser,
  UserListFilter,
  UserPatch,
  UserRecord,
  UserRepository,
} from './user-repository.ts'

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

  async list(filter: UserListFilter): Promise<{ items: UserRecord[]; total: number }> {
    const keyword = filter.keyword?.toLowerCase()
    const matches = [...this.#users.values()].filter((user) => {
      if (filter.role !== undefined && user.role !== filter.role) return false
      if (filter.status !== undefined && user.status !== filter.status) return false
      if (keyword) {
        const username = user.username.toLowerCase()
        const displayName = user.displayName?.toLowerCase() ?? ''
        if (!username.includes(keyword) && !displayName.includes(keyword)) return false
      }
      return true
    })

    matches.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const offset = (filter.page - 1) * filter.pageSize
    return { items: matches.slice(offset, offset + filter.pageSize), total: matches.length }
  }

  async update(id: string, patch: UserPatch): Promise<UserRecord | null> {
    const user = this.#users.get(id)
    if (!user) return null
    const updated: UserRecord = { ...user, ...patch, updatedAt: new Date() }
    this.#users.set(id, updated)
    return updated
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

type UserOverrides = Partial<Omit<UserRecord, 'createdAt' | 'updatedAt'>>

export const makeUser = (overrides: UserOverrides = {}): UserRecord => ({
  id: overrides.id ?? randomUUID(),
  username: overrides.username ?? 'alice',
  passwordHash: overrides.passwordHash ?? 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
  displayName: overrides.displayName ?? null,
  role: overrides.role ?? 'user',
  status: overrides.status ?? 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
})

type RefreshTokenOverrides = Partial<Omit<RefreshTokenRecord, 'createdAt'>>

export const makeRefreshToken = (overrides: RefreshTokenOverrides = {}): RefreshTokenRecord => ({
  id: overrides.id ?? randomUUID(),
  userId: overrides.userId ?? randomUUID(),
  tokenHash: overrides.tokenHash ?? 'a'.repeat(64),
  expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
  revokedAt: overrides.revokedAt ?? null,
  createdAt: new Date(),
})

export class MemoryTicketCategoryRepository implements TicketCategoryRepository {
  readonly #categories = new Map<string, TicketCategoryRecord>()

  constructor(seed: TicketCategoryRecord[] = []) {
    for (const category of seed) this.#categories.set(category.id, category)
  }

  async list(
    filter: TicketCategoryListFilter,
  ): Promise<{ items: TicketCategoryRecord[]; total: number }> {
    const keyword = filter.keyword?.toLowerCase()
    const matches = [...this.#categories.values()].filter((category) => {
      if (filter.enabled !== undefined && category.enabled !== filter.enabled) return false
      if (keyword) {
        const name = category.name.toLowerCase()
        const description = category.description?.toLowerCase() ?? ''
        if (!name.includes(keyword) && !description.includes(keyword)) return false
      }
      return true
    })
    matches.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const offset = (filter.page - 1) * filter.pageSize
    return { items: matches.slice(offset, offset + filter.pageSize), total: matches.length }
  }

  async findById(id: string): Promise<TicketCategoryRecord | null> {
    return this.#categories.get(id) ?? null
  }

  async findByName(name: string): Promise<TicketCategoryRecord | null> {
    for (const category of this.#categories.values()) {
      if (category.name === name) return category
    }
    return null
  }

  async insert(category: NewTicketCategory): Promise<TicketCategoryRecord> {
    const record: TicketCategoryRecord = {
      id: randomUUID(),
      ...category,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.#categories.set(record.id, record)
    return record
  }

  async update(id: string, patch: TicketCategoryPatch): Promise<TicketCategoryRecord | null> {
    const category = this.#categories.get(id)
    if (!category) return null
    const updated: TicketCategoryRecord = { ...category, ...patch, updatedAt: new Date() }
    this.#categories.set(id, updated)
    return updated
  }
}

export class MemoryTicketRepository implements TicketRepository {
  readonly #tickets = new Map<string, TicketRecord>()

  constructor(seed: TicketRecord[] = []) {
    for (const ticket of seed) this.#tickets.set(ticket.id, ticket)
  }

  async list(filter: TicketListFilter): Promise<{ items: TicketRecord[]; total: number }> {
    const keyword = filter.keyword?.toLowerCase()
    const matches = [...this.#tickets.values()].filter((ticket) => {
      if (filter.status !== undefined && ticket.status !== filter.status) return false
      if (filter.priority !== undefined && ticket.priority !== filter.priority) return false
      if (filter.categoryId !== undefined && ticket.categoryId !== filter.categoryId) return false
      if (filter.requesterId !== undefined && ticket.requesterId !== filter.requesterId)
        return false
      if (filter.handlerId !== undefined && ticket.handlerId !== filter.handlerId) return false
      if (filter.createdFrom !== undefined && ticket.createdAt < filter.createdFrom) return false
      if (filter.createdTo !== undefined && ticket.createdAt > filter.createdTo) return false
      if (keyword) {
        const title = ticket.title.toLowerCase()
        const description = ticket.description.toLowerCase()
        if (!title.includes(keyword) && !description.includes(keyword)) return false
      }
      return true
    })
    matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const offset = (filter.page - 1) * filter.pageSize
    return { items: matches.slice(offset, offset + filter.pageSize), total: matches.length }
  }

  async findById(id: string): Promise<TicketRecord | null> {
    return this.#tickets.get(id) ?? null
  }

  async insert(ticket: NewTicket): Promise<TicketRecord> {
    const record: TicketRecord = {
      id: randomUUID(),
      ...ticket,
      resolvedAt: null,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.#tickets.set(record.id, record)
    return record
  }

  async update(id: string, patch: TicketPatch): Promise<TicketRecord | null> {
    const ticket = this.#tickets.get(id)
    if (!ticket) return null
    const updated: TicketRecord = { ...ticket, ...patch, updatedAt: new Date() }
    this.#tickets.set(id, updated)
    return updated
  }
}

export class MemoryTicketEventRepository implements TicketEventRepository {
  readonly #events: TicketEventRecord[]

  constructor(seed: TicketEventRecord[] = []) {
    this.#events = [...seed]
  }

  async insert(event: NewTicketEvent): Promise<TicketEventRecord> {
    const record: TicketEventRecord = { id: randomUUID(), ...event, createdAt: new Date() }
    this.#events.push(record)
    return record
  }

  async listByTicket(ticketId: string): Promise<TicketEventRecord[]> {
    return this.#events
      .filter((event) => event.ticketId === ticketId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }
}

export class MemoryTicketCommentRepository implements TicketCommentRepository {
  readonly #comments: TicketCommentRecord[]

  constructor(seed: TicketCommentRecord[] = []) {
    this.#comments = [...seed]
  }

  async insert(comment: NewTicketComment): Promise<TicketCommentRecord> {
    const record: TicketCommentRecord = { id: randomUUID(), ...comment, createdAt: new Date() }
    this.#comments.push(record)
    return record
  }

  async listByTicket(ticketId: string): Promise<TicketCommentRecord[]> {
    return this.#comments
      .filter((comment) => comment.ticketId === ticketId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }
}

type TicketCategoryOverrides = Partial<Omit<TicketCategoryRecord, 'createdAt' | 'updatedAt'>>

export const makeTicketCategory = (
  overrides: TicketCategoryOverrides = {},
): TicketCategoryRecord => ({
  id: overrides.id ?? randomUUID(),
  name: overrides.name ?? '账号问题',
  description: overrides.description ?? null,
  enabled: overrides.enabled ?? true,
  createdAt: new Date(),
  updatedAt: new Date(),
})

type TicketOverrides = Partial<
  Omit<TicketRecord, 'resolvedAt' | 'closedAt' | 'createdAt' | 'updatedAt'>
>

export const makeTicket = (overrides: TicketOverrides = {}): TicketRecord => ({
  id: overrides.id ?? randomUUID(),
  title: overrides.title ?? '登录失败',
  description: overrides.description ?? '用户无法登录',
  categoryId: overrides.categoryId ?? randomUUID(),
  priority: overrides.priority ?? 'medium',
  status: overrides.status ?? 'pending',
  requesterId: overrides.requesterId ?? randomUUID(),
  handlerId: overrides.handlerId ?? null,
  resolvedAt: null,
  closedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

type TicketCommentOverrides = Partial<Omit<TicketCommentRecord, 'createdAt'>>

export const makeTicketComment = (overrides: TicketCommentOverrides = {}): TicketCommentRecord => ({
  id: overrides.id ?? randomUUID(),
  ticketId: overrides.ticketId ?? randomUUID(),
  authorId: overrides.authorId ?? randomUUID(),
  body: overrides.body ?? '请提供更多信息',
  kind: overrides.kind ?? 'public',
  createdAt: new Date(),
})
