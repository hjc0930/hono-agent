import { describe, expect, it } from 'vitest'

import { verifyPassword } from '../lib/password.ts'
import { MemoryUserRepository } from '../repositories/fakes.ts'

import { seedAdmin, validateSeedConfig } from './seed.ts'

describe('validateSeedConfig', () => {
  it('allows the short local fixture only in local mode', () => {
    const source = { SEED_ADMIN_USERNAME: 'admin', SEED_ADMIN_PASSWORD: 'admin' }
    expect(validateSeedConfig(source).ok).toBe(false)
    expect(validateSeedConfig(source, { local: true })).toEqual({
      ok: true,
      config: { username: 'admin', password: 'admin' },
    })
    expect(validateSeedConfig({}, { local: true }).ok).toBe(false)
  })

  it('rejects a missing password', () => {
    const result = validateSeedConfig({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('SEED_ADMIN_PASSWORD')
  })

  it('rejects a short password', () => {
    const result = validateSeedConfig({ SEED_ADMIN_PASSWORD: 'short' })
    expect(result.ok).toBe(false)
  })

  it('rejects a malformed username', () => {
    const result = validateSeedConfig({
      SEED_ADMIN_USERNAME: 'Bad Username!',
      SEED_ADMIN_PASSWORD: 'long-enough-password',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('SEED_ADMIN_USERNAME')
  })

  it('returns the config with the default admin username', () => {
    const result = validateSeedConfig({ SEED_ADMIN_PASSWORD: 'long-enough-password' })
    expect(result).toEqual({
      ok: true,
      config: { username: 'admin', password: 'long-enough-password' },
    })
  })
})

describe('seedAdmin', () => {
  it('creates and then resets the existing local administrator without changing its identity', async () => {
    const repository = new MemoryUserRepository()
    expect(await seedAdmin(repository, { username: 'admin', password: 'old-password' })).toBe(
      'created',
    )
    const original = await repository.findByUsername('admin')
    await repository.update(original!.id, { role: 'user', status: 'disabled' })
    expect(
      await seedAdmin(repository, { username: 'admin', password: 'admin' }, { local: true }),
    ).toBe('updated')
    const updated = await repository.findByUsername('admin')
    expect(updated).toMatchObject({ id: original!.id, role: 'admin', status: 'active' })
    expect(await verifyPassword('admin', updated!.passwordHash)).toBe(true)
  })

  it('preserves an existing account outside local mode', async () => {
    const repository = new MemoryUserRepository()
    await seedAdmin(repository, { username: 'admin', password: 'old-password' })
    expect(await seedAdmin(repository, { username: 'admin', password: 'new-password' })).toBe(
      'skipped',
    )
    const user = await repository.findByUsername('admin')
    expect(await verifyPassword('old-password', user!.passwordHash)).toBe(true)
  })
})
