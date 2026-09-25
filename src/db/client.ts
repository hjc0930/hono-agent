import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'

import { env } from '../config/env.ts'
import * as schema from './schema.ts'

export type Database = NodePgDatabase<typeof schema>

// Database initialization is intentionally deferred. This module avoids opening a
// connection on import so the baseline remains runnable without a PostgreSQL instance.
export const databaseUrl = env.DATABASE_URL || undefined

let cachedDatabase: Database | undefined

export const getDatabase = (): Database => {
  cachedDatabase ??= createDatabase()
  return cachedDatabase
}

const createDatabase = (): Database => {
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured')
  return drizzle(databaseUrl, { schema })
}
