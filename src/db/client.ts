import { env } from '../config/env.ts'

// Database initialization is intentionally deferred. This module avoids opening a
// connection so the baseline remains runnable without a PostgreSQL instance.
export const databaseUrl = env.DATABASE_URL || undefined
