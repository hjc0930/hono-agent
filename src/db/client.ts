import { mkdirSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg, type PgliteDatabase } from 'drizzle-orm/pglite'
import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'

import { env } from '../config/env.ts'
import * as schema from './schema.ts'

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>

// Production connects to a real PostgreSQL via DATABASE_URL. Local development,
// with DATABASE_URL unset, falls back to embedded PGlite persisted under .data/pglite
// so no PostgreSQL server is required.
export const databaseUrl = env.DATABASE_URL || undefined

const PGLITE_DATA_DIR = '.data/pglite'

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
  if (databaseUrl) {
    const database = drizzleNodePg(databaseUrl, { schema })
    closeClient = () => database.$client.end()
    return database
  }
  // PGlite does not create parent directories, so ensure the data dir exists first.
  mkdirSync(PGLITE_DATA_DIR, { recursive: true })
  const client = new PGlite(PGLITE_DATA_DIR)
  closeClient = () => client.close()
  return drizzlePg(client, { schema })
}
