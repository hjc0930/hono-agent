import { mkdirSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg, type PgliteDatabase } from 'drizzle-orm/pglite'
import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'

import { databaseConfig, PGLITE_MEMORY_URL } from '../config/env.ts'
import * as schema from './schema.ts'

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>

// PostgreSQL is used when DATABASE_TYPE=postgres (or DATABASE_TYPE is unset and
// DATABASE_URL is a URL). Otherwise the embedded PGlite engine runs against the
// DATABASE_URL location: a data directory (default .data/pglite) or memory:// for
// an in-memory database, which tests rely on for isolation.
let cachedDatabase: Database | undefined
let closeClient: (() => Promise<void>) | undefined
let closing: Promise<void> | undefined

export const getDatabase = (): Database => {
  if (closing) throw new Error('Database is shutting down')
  cachedDatabase ??= createDatabase()
  return cachedDatabase
}

export const closeDatabase = (): Promise<void> => {
  closing ??= Promise.resolve().then(async () => {
    await closeClient?.()
    cachedDatabase = undefined
  })
  return closing
}

const createDatabase = (): Database => {
  if (databaseConfig.type === 'postgres') {
    const database = drizzleNodePg(databaseConfig.url, { schema })
    closeClient = () => database.$client.end()
    return database
  }
  // PGlite does not create parent directories, so ensure the data dir exists first.
  if (databaseConfig.url !== PGLITE_MEMORY_URL) {
    mkdirSync(databaseConfig.url, { recursive: true })
  }
  const client = new PGlite(databaseConfig.url)
  closeClient = () => client.close()
  return drizzlePg(client, { schema })
}
