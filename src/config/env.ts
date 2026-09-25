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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default(''),
  DATABASE_URL: z.url().optional().or(z.literal('')),
  JWT_SECRET: z.string().min(32),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
  AUTH_MAX_LOGIN_FAILURES: z.coerce.number().int().min(1).default(5),
  AUTH_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_IP_FAILURE_LIMIT: z.coerce.number().int().min(1).default(20),
  AUTH_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  SEED_ADMIN_USERNAME: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export const env = envSchema.parse(process.env)

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
