import { scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password.ts'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>

describe('password hashing', () => {
  it('verifies a freshly hashed password (roundtrip)', async () => {
    const stored = await hashPassword('correct-horse-battery')
    await expect(verifyPassword('correct-horse-battery', stored)).resolves.toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct-horse-battery')
    await expect(verifyPassword('wrong-password-value', stored)).resolves.toBe(false)
  })

  it('produces a different hash for the same password (unique salt)', async () => {
    const first = await hashPassword('same-password')
    const second = await hashPassword('same-password')
    expect(first).not.toBe(second)
  })

  it('returns false without throwing for a malformed stored hash', async () => {
    await expect(verifyPassword('whatever', 'garbage')).resolves.toBe(false)
    await expect(verifyPassword('whatever', 'scrypt$16384$8$1$!!!$!!!')).resolves.toBe(false)
    await expect(verifyPassword('whatever', 'scrypt$abc$8$1$c2FsdA==$aGFzaA==')).resolves.toBe(
      false,
    )
    await expect(verifyPassword('whatever', '')).resolves.toBe(false)
  })

  it('reads cost parameters from the stored string (non-default N verifies)', async () => {
    const salt = Buffer.from('fixed-salt-bytes')
    const derived = await scrypt('correct-horse-battery', salt, 64, { N: 2048, r: 8, p: 1 })
    const encoded = [
      'scrypt',
      2048,
      8,
      1,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$')
    await expect(verifyPassword('correct-horse-battery', encoded)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password-value', encoded)).resolves.toBe(false)
  })
})
