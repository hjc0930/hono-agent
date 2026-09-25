import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

type ScryptOptions = {
  N: number
  r: number
  p: number
}

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>

const DEFAULT_PARAMS: ScryptOptions = { N: 16_384, r: 8, p: 1 }
const SALT_LENGTH = 16
const KEY_LENGTH = 64
const ENCODED_PARTS = 6

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(password, salt, KEY_LENGTH, DEFAULT_PARAMS)
  return [
    'scrypt',
    DEFAULT_PARAMS.N,
    DEFAULT_PARAMS.r,
    DEFAULT_PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => {
  try {
    const parts = encoded.split('$')
    if (parts.length !== ENCODED_PARTS || parts[0] !== 'scrypt') return false

    const N = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false
    if (N < 16 || r < 1 || p < 1) return false
    // Cap derived memory (128 * N * r) so a tampered stored hash cannot exhaust memory.
    if (128 * N * r > 128 * 1024 * 1024) return false

    const salt = Buffer.from(parts[4]!, 'base64')
    const expected = Buffer.from(parts[5]!, 'base64')
    if (salt.length === 0 || expected.length === 0) return false

    const derived = await scrypt(password, salt, expected.length, { N, r, p })
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

let dummyHashPromise: Promise<string> | undefined

// Constant used to equalize login timing when the username does not exist.
const getDummyHash = (): Promise<string> => {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString('hex'))
  return dummyHashPromise
}

export const verifyDummyPassword = async (password: string): Promise<void> => {
  await verifyPassword(password, await getDummyHash())
}
