import { pathToFileURL } from 'node:url'

import { migrate as migratePg } from 'drizzle-orm/pglite/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { logger } from '../lib/logger.ts'
import * as schema from './schema.ts'
import { databaseUrl, getDatabase } from './client.ts'

export const runMigrations = async (): Promise<void> => {
  const db = getDatabase()
  if (databaseUrl) {
    // Remote PostgreSQL.
    await migrateNodePg(db as NodePgDatabase<typeof schema>, { migrationsFolder: './drizzle' })
  } else {
    // Embedded PGlite.
    await migratePg(db as PgliteDatabase<typeof schema>, { migrationsFolder: './drizzle' })
  }
}

const isExecutedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isExecutedDirectly) {
  void runMigrations().catch((error: unknown) => {
    logger.error({ error }, 'migration failed')
    process.exitCode = 1
  })
}
