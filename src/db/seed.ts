import { pathToFileURL } from 'node:url'

import { logger } from '../lib/logger.ts'
import { hashPassword } from '../lib/password.ts'
import { DrizzleUserRepository } from '../repositories/user-repository.ts'
import { getDatabase } from './client.ts'
import { runMigrations } from './migrate.ts'

const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/

export type SeedConfig = {
  username: string
  password: string
}

export type SeedConfigResult = { ok: true; config: SeedConfig } | { ok: false; errors: string[] }

export const validateSeedConfig = (source: {
  SEED_ADMIN_USERNAME?: string
  SEED_ADMIN_PASSWORD?: string
}): SeedConfigResult => {
  const errors: string[] = []

  const username = source.SEED_ADMIN_USERNAME ?? 'admin'
  if (!USERNAME_PATTERN.test(username)) {
    errors.push('SEED_ADMIN_USERNAME must match /^[a-z0-9_-]{3,32}$/')
  }

  const password = source.SEED_ADMIN_PASSWORD
  if (!password || password.length < 8 || password.length > 128) {
    errors.push('SEED_ADMIN_PASSWORD is required and must be 8-128 characters')
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, config: { username, password: password! } }
}

const run = async (): Promise<void> => {
  const parsed = validateSeedConfig(process.env)
  if (!parsed.ok) {
    logger.error({ errors: parsed.errors }, 'seed failed: invalid configuration')
    process.exitCode = 1
    return
  }

  await runMigrations()

  const { username, password } = parsed.config
  const repository = new DrizzleUserRepository(getDatabase)

  const existing = await repository.findByUsername(username)
  if (existing) {
    logger.info({ username }, 'seed skipped: user exists')
    return
  }

  await repository.insert({
    username,
    passwordHash: await hashPassword(password),
    displayName: null,
    role: 'admin',
    status: 'active',
  })
  logger.info({ username }, 'seed created admin user')
}

const isExecutedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isExecutedDirectly) {
  void run().catch((error: unknown) => {
    logger.error({ error }, 'seed failed: database error')
    process.exitCode = 1
  })
}
