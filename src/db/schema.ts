import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import type { UserRole } from '../types.ts'

export const userRoleEnum = pgEnum('user_role', ['admin', 'agent', 'user'])

export const userStatusEnum = pgEnum('user_status', ['active', 'disabled'])

export type DbUserRole = (typeof userRoleEnum.enumValues)[number]

// Type-level guarantee that the pgEnum values and UserRole never drift apart.
type UserRoleMatches = DbUserRole extends UserRole
  ? UserRole extends DbUserRole
    ? true
    : false
  : false

const assertUserRoleMatches: UserRoleMatches = true
void assertUserRoleMatches

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name'),
    role: userRoleEnum('role').notNull().default('user'),
    status: userStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_username_unique').on(table.username)],
)

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_token_hash_unique').on(table.tokenHash),
    index('refresh_tokens_user_id_idx').on(table.userId),
  ],
)

export const ticketPriorityEnum = pgEnum('ticket_priority', ['low', 'medium', 'high', 'urgent'])

export const ticketStatusEnum = pgEnum('ticket_status', [
  'pending',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
])

export const commentKindEnum = pgEnum('comment_kind', ['public', 'internal'])

export const ticketCategories = pgTable(
  'ticket_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('ticket_categories_name_unique').on(table.name)],
)

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => ticketCategories.id),
    priority: ticketPriorityEnum('priority').notNull().default('medium'),
    status: ticketStatusEnum('status').notNull().default('pending'),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id),
    handlerId: uuid('handler_id').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tickets_status_idx').on(table.status),
    index('tickets_requester_id_idx').on(table.requesterId),
    index('tickets_handler_id_idx').on(table.handlerId),
    index('tickets_category_id_idx').on(table.categoryId),
  ],
)

export const ticketEvents = pgTable(
  'ticket_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    fromStatus: ticketStatusEnum('from_status').notNull(),
    toStatus: ticketStatusEnum('to_status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ticket_events_ticket_id_idx').on(table.ticketId)],
)

export const ticketComments = pgTable(
  'ticket_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    kind: commentKindEnum('kind').notNull().default('public'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ticket_comments_ticket_id_idx').on(table.ticketId)],
)
