import { pathToFileURL } from 'node:url'

import { logger } from '../lib/logger.ts'
import { hashPassword } from '../lib/password.ts'
import { DrizzleUserRepository, type UserRepository } from '../repositories/user-repository.ts'
import { closeDatabase, getDatabase } from './client.ts'
import { runMigrations } from './migrate.ts'

const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/

export type SeedConfig = {
  username: string
  password: string
}

export type SeedConfigResult = { ok: true; config: SeedConfig } | { ok: false; errors: string[] }

export const validateSeedConfig = (
  source: {
    SEED_ADMIN_USERNAME?: string
    SEED_ADMIN_PASSWORD?: string
  },
  options: { local?: boolean } = {},
): SeedConfigResult => {
  const errors: string[] = []

  const username = source.SEED_ADMIN_USERNAME ?? 'admin'
  if (!USERNAME_PATTERN.test(username)) {
    errors.push('SEED_ADMIN_USERNAME must match /^[a-z0-9_-]{3,32}$/')
  }

  const password = source.SEED_ADMIN_PASSWORD
  const minimumLength = options.local ? 1 : 8
  if (!password || password.length < minimumLength || password.length > 128) {
    errors.push(`SEED_ADMIN_PASSWORD is required and must be ${minimumLength}-128 characters`)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, config: { username, password: password! } }
}

const run = async (): Promise<void> => {
  const local = process.argv.includes('--local')
  if (local && process.env.DATABASE_URL) {
    throw new Error('Local seed requires an empty DATABASE_URL')
  }
  const parsed = validateSeedConfig(process.env, { local })
  if (!parsed.ok) {
    logger.error({ errors: parsed.errors }, 'seed failed: invalid configuration')
    process.exitCode = 1
    return
  }

  await runMigrations()

  const result = await seedAdmin(new DrizzleUserRepository(getDatabase), parsed.config, { local })
  logger.info({ username: parsed.config.username }, `seed ${result} admin user`)
}

export const seedAdmin = async (
  repository: UserRepository,
  config: SeedConfig,
  options: { local?: boolean } = {},
): Promise<'created' | 'updated' | 'skipped'> => {
  const { username, password } = config
  const existing = await repository.findByUsername(username)
  if (existing) {
    if (!options.local) return 'skipped'
    const updated = await repository.update(existing.id, {
      passwordHash: await hashPassword(password),
      role: 'admin',
      status: 'active',
    })
    if (!updated) throw new Error('Local administrator update failed')
    return 'updated'
  }
  await repository.insert({
    username,
    passwordHash: await hashPassword(password),
    displayName: null,
    role: 'admin',
    status: 'active',
  })
  return 'created'
}

const isExecutedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isExecutedDirectly) {
  void run()
    .finally(closeDatabase)
    .catch((error: unknown) => {
      logger.error({ error }, 'seed failed: database error')
      process.exitCode = 1
    })
}
