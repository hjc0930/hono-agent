import { describe, expect, it } from 'vitest'

import { validateSeedConfig } from './seed.ts'

describe('validateSeedConfig', () => {
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
