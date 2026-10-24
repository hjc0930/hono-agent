import { z } from 'zod'

// Load the local .env file for development and production runs. Tests inject their
// own environment in vitest.setup.ts and must never read a developer's local .env.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile()
  } catch {
    // Missing .env is fine; the process inherits the real environment instead.
  }
}

export type DatabaseType = 'postgres' | 'pglite'

export type DatabaseConfig = {
  type: DatabaseType
  /** PostgreSQL connection string, or the embedded PGlite data location. */
  url: string
}

export const DEFAULT_PGLITE_DATA_DIR = '.data/pglite'

export const PGLITE_MEMORY_URL = 'memory://'

const urlSchema = z.url()

const isUrl = (value: string) => urlSchema.safeParse(value).success

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1).max(2_147_483_647).default(10_000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z.string().default(''),
    DATABASE_TYPE: z.enum(['postgres', 'pglite']).optional(),
    // Any string parses here; the refinement below enforces URL shape where it is
    // required and lets the pglite selection carry a filesystem path instead.
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: z.string().min(32),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
    AUTH_MAX_LOGIN_FAILURES: z.coerce.number().int().min(1).default(5),
    AUTH_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),
    AUTH_IP_FAILURE_LIMIT: z.coerce.number().int().min(1).default(20),
    AUTH_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  })
  .superRefine((value, ctx) => {
    if (value.DATABASE_TYPE === 'pglite') return
    if (value.DATABASE_URL && isUrl(value.DATABASE_URL)) return
    if (!value.DATABASE_TYPE && !value.DATABASE_URL) return

    if (value.DATABASE_TYPE === 'postgres' && !value.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        message: 'DATABASE_URL is required when DATABASE_TYPE is postgres',
      })
      return
    }

    ctx.addIssue({
      code: 'custom',
      message:
        'DATABASE_URL must be a valid URL, or set DATABASE_TYPE=pglite to use a PGlite data directory',
    })
  })

export type EnvType = z.infer<typeof envSchema>

// DATABASE_TYPE is optional for backward compatibility: an unset type keeps the
// historical inference where a URL-shaped DATABASE_URL selects PostgreSQL.
export const resolveDatabaseConfig = (source: {
  DATABASE_TYPE?: DatabaseType | undefined
  DATABASE_URL?: string | undefined
}): DatabaseConfig => {
  const url = source.DATABASE_URL ?? ''
  const type: DatabaseType =
    source.DATABASE_TYPE ?? (url.length > 0 && isUrl(url) ? 'postgres' : 'pglite')

  if (type === 'postgres') return { type, url }
  return { type, url: url.length > 0 ? url : DEFAULT_PGLITE_DATA_DIR }
}

export const env = envSchema.parse(process.env)

export const databaseConfig = resolveDatabaseConfig(env)

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
