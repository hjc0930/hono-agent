import { randomUUID } from 'node:crypto'

import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../db/schema.ts'
import { DrizzleRefreshTokenRepository } from './refresh-token-repository.ts'
import { DrizzleTicketRepository } from './ticket-repository.ts'

const client = new PGlite()
const db = drizzle(client, { schema })

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
})

afterAll(async () => {
  await client.close()
})

describe('atomic repository writes', () => {
  it('rolls back refresh-token revocation when replacement insertion violates a unique constraint', async () => {
    const userId = randomUUID()
    await db
      .insert(schema.users)
      .values({ id: userId, username: `user-${userId}`, passwordHash: 'test' })
    const repository = new DrizzleRefreshTokenRepository(() => db)
    const original = await repository.insert({
      userId,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    })
    await repository.insert({
      userId,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    })

    await expect(
      repository.rotate(original.id, {
        userId,
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow()

    const rows = await db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.userId, userId))
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.id === original.id)?.revokedAt).toBeNull()
  })

  it('rolls back a ticket transition when its event has an invalid actor', async () => {
    const userId = randomUUID()
    const categoryId = randomUUID()
    await db
      .insert(schema.users)
      .values({ id: userId, username: `user-${userId}`, passwordHash: 'test' })
    await db
      .insert(schema.ticketCategories)
      .values({ id: categoryId, name: `category-${categoryId}` })
    const repository = new DrizzleTicketRepository(() => db)
    const ticket = await repository.insert({
      title: 'test',
      description: 'test',
      categoryId,
      priority: 'medium',
      status: 'pending',
      requesterId: userId,
      handlerId: null,
    })

    await expect(
      repository.updateWithEvent(ticket.id, 'pending', { status: 'cancelled' }, randomUUID()),
    ).rejects.toThrow()
    expect((await repository.findById(ticket.id))?.status).toBe('pending')
    expect(
      await db
        .select()
        .from(schema.ticketEvents)
        .where(eq(schema.ticketEvents.ticketId, ticket.id)),
    ).toHaveLength(0)

    await expect(
      repository.updateWithEvent(ticket.id, 'pending', { status: 'cancelled' }, userId),
    ).resolves.toMatchObject({ status: 'cancelled' })
    expect(
      await db
        .select()
        .from(schema.ticketEvents)
        .where(eq(schema.ticketEvents.ticketId, ticket.id)),
    ).toHaveLength(1)
  })
})
