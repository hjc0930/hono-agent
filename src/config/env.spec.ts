import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EnvType } from './env.ts'

const TEST_SECRET = 'vitest-only-secret-0123456789abcdef0123456789abcdef'

const ENV_KEYS = [
  'NODE_ENV',
  'PORT',
  'SHUTDOWN_TIMEOUT_MS',
  'LOG_LEVEL',
  'CORS_ORIGINS',
  'DATABASE_TYPE',
  'DATABASE_URL',
  'JWT_SECRET',
  'AUTH_ACCESS_TOKEN_TTL_SECONDS',
  'AUTH_REFRESH_TOKEN_TTL_SECONDS',
  'AUTH_MAX_LOGIN_FAILURES',
  'AUTH_LOCKOUT_SECONDS',
  'AUTH_IP_FAILURE_LIMIT',
  'AUTH_IP_WINDOW_SECONDS',
] as const satisfies readonly (keyof EnvType)[]

type EnvKey = (typeof ENV_KEYS)[number]

const loadEnv = async (overrides: Partial<Record<EnvKey, string>> = {}) => {
  for (const key of ENV_KEYS) vi.stubEnv(key, undefined)
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value)

  vi.resetModules()
  return import('./env.ts')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('environment configuration', () => {
  it('uses defaults for optional environment variables', async () => {
    vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {})

    const { env, corsOrigins } = await loadEnv({ JWT_SECRET: TEST_SECRET })

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      SHUTDOWN_TIMEOUT_MS: 10_000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: '',
      JWT_SECRET: TEST_SECRET,
      AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
      AUTH_REFRESH_TOKEN_TTL_SECONDS: 604_800,
      AUTH_MAX_LOGIN_FAILURES: 5,
      AUTH_LOCKOUT_SECONDS: 900,
      AUTH_IP_FAILURE_LIMIT: 20,
      AUTH_IP_WINDOW_SECONDS: 900,
    })
    expect(env.DATABASE_URL).toBeUndefined()
    expect(corsOrigins).toEqual([])
  })

  it('parses explicit values and comma-separated CORS origins', async () => {
    const { env, corsOrigins, databaseConfig } = await loadEnv({
      NODE_ENV: 'test',
      PORT: '4000',
      SHUTDOWN_TIMEOUT_MS: '2500',
      LOG_LEVEL: 'debug',
      CORS_ORIGINS: 'http://example.com, http://localhost:3000',
      DATABASE_URL: 'postgresql://localhost:5432/hono_agent',
      JWT_SECRET: TEST_SECRET,
      AUTH_ACCESS_TOKEN_TTL_SECONDS: '60',
      AUTH_REFRESH_TOKEN_TTL_SECONDS: '120',
      AUTH_MAX_LOGIN_FAILURES: '3',
      AUTH_LOCKOUT_SECONDS: '30',
      AUTH_IP_FAILURE_LIMIT: '10',
      AUTH_IP_WINDOW_SECONDS: '45',
    })

    expect(env).toMatchObject({
      NODE_ENV: 'test',
      PORT: 4000,
      SHUTDOWN_TIMEOUT_MS: 2500,
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgresql://localhost:5432/hono_agent',
      AUTH_ACCESS_TOKEN_TTL_SECONDS: 60,
      AUTH_REFRESH_TOKEN_TTL_SECONDS: 120,
      AUTH_MAX_LOGIN_FAILURES: 3,
      AUTH_LOCKOUT_SECONDS: 30,
      AUTH_IP_FAILURE_LIMIT: 10,
      AUTH_IP_WINDOW_SECONDS: 45,
    })
    expect(databaseConfig).toEqual({
      type: 'postgres',
      url: 'postgresql://localhost:5432/hono_agent',
    })
    expect(corsOrigins).toEqual(['http://example.com', 'http://localhost:3000'])
  })

  it('defaults to embedded PGlite at the standard data directory', async () => {
    const { databaseConfig } = await loadEnv({ JWT_SECRET: TEST_SECRET })

    expect(databaseConfig).toEqual({ type: 'pglite', url: '.data/pglite' })
  })

  it.each([
    ['memory://'],
    ['C:\\temp\\isolated-pglite'],
    ['/tmp/isolated-pglite'],
    [''], // empty string falls back to the default data directory
  ])('accepts a pglite selection with DATABASE_URL %s', async (url) => {
    const { env, databaseConfig } = await loadEnv({
      JWT_SECRET: TEST_SECRET,
      DATABASE_TYPE: 'pglite',
      ...(url.length > 0 ? { DATABASE_URL: url } : {}),
    })

    expect(env.DATABASE_TYPE).toBe('pglite')
    expect(databaseConfig).toEqual({
      type: 'pglite',
      url: url.length > 0 ? url : '.data/pglite',
    })
  })

  it('rejects a postgres selection without a URL', async () => {
    await expect(loadEnv({ JWT_SECRET: TEST_SECRET, DATABASE_TYPE: 'postgres' })).rejects.toThrow(
      /DATABASE_URL is required/,
    )
  })

  it('rejects a postgres selection with a non-URL value', async () => {
    await expect(
      loadEnv({
        JWT_SECRET: TEST_SECRET,
        DATABASE_TYPE: 'postgres',
        DATABASE_URL: 'not-a-url',
      }),
    ).rejects.toThrow()
  })

  it('rejects a non-URL DATABASE_URL when the type is inferred', async () => {
    await expect(loadEnv({ JWT_SECRET: TEST_SECRET, DATABASE_URL: 'not-a-url' })).rejects.toThrow(
      /DATABASE_TYPE=pglite/,
    )
  })

  it('rejects an invalid required JWT secret', async () => {
    await expect(loadEnv({ NODE_ENV: 'test', JWT_SECRET: 'too-short' })).rejects.toThrow()
  })

  it.each(['0', '-1', '1.5', 'invalid', '2147483648'])(
    'rejects invalid shutdown timeout %s',
    async (value) => {
      await expect(
        loadEnv({ NODE_ENV: 'test', JWT_SECRET: TEST_SECRET, SHUTDOWN_TIMEOUT_MS: value }),
      ).rejects.toThrow()
    },
  )
})
