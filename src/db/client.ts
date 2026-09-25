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

export const getDatabase = (): Database => {
  cachedDatabase ??= createDatabase()
  return cachedDatabase
}

const createDatabase = (): Database => {
  if (databaseUrl) {
    return drizzleNodePg(databaseUrl, { schema })
  }
  // PGlite does not create parent directories, so ensure the data dir exists first.
  mkdirSync(PGLITE_DATA_DIR, { recursive: true })
  return drizzlePg(new PGlite(PGLITE_DATA_DIR), { schema })
}
