import { createHash, randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { hashPassword } from '../lib/password.ts'
import { MemoryRefreshTokenRepository, MemoryUserRepository } from '../repositories/fakes.ts'
import { createAuthService } from './auth.ts'

const PASSWORD = 'correct-horse-battery'

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

const setup = async () => {
  const userRepository = new MemoryUserRepository()
  const refreshTokenRepository = new MemoryRefreshTokenRepository()
  const service = createAuthService({ userRepository, refreshTokenRepository })
  const admin = await userRepository.insert({
    username: 'admin',
    passwordHash: await hashPassword(PASSWORD),
    displayName: null,
    role: 'admin',
    status: 'active',
  })
  return { service, userRepository, refreshTokenRepository, admin }
}

const errorFields = async (run: () => Promise<unknown>) => {
  try {
    await run()
    throw new Error('expected the call to throw')
  } catch (error) {
    const appError = error as { status?: number; code?: string; message?: string }
    return {
      status: appError.status,
      code: appError.code,
      message: appError.message,
    }
  }
}

describe('AuthService.login', () => {
  it('issues a token pair and stores a refresh row for an active user', async () => {
    const { service, refreshTokenRepository, admin } = await setup()

    const result = await service.login({ username: 'admin', password: PASSWORD })

    expect(result.user).toEqual({
      id: admin.id,
      username: 'admin',
      displayName: null,
      role: 'admin',
      status: 'active',
    })
    expect(result.tokenType).toBe('Bearer')
    expect(result.expiresIn).toBeGreaterThan(0)
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(result.accessToken.split('.')).toHaveLength(3)

    const rows = refreshTokenRepository.all().filter((row) => row.userId === admin.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tokenHash).toBe(sha256(result.refreshToken))
    expect(rows[0]!.revokedAt).toBeNull()
  })

  it('fails identically for unknown user and wrong password', async () => {
    const { service } = await setup()

    const unknown = await errorFields(() =>
      service.login({ username: 'ghost', password: PASSWORD }),
    )
    const wrong = await errorFields(() =>
      service.login({ username: 'admin', password: 'totally-wrong-password' }),
    )

    expect(unknown).toEqual(wrong)
    expect(unknown).toEqual({
      status: 401,
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    })
  })

  it('rejects a disabled account only after the password verifies', async () => {
    const { service, userRepository, admin } = await setup()
    userRepository.setStatus(admin.id, 'disabled')

    const correctPassword = await errorFields(() =>
      service.login({ username: 'admin', password: PASSWORD }),
    )
    const wrongPassword = await errorFields(() =>
      service.login({ username: 'admin', password: 'totally-wrong-password' }),
    )

    expect(correctPassword).toEqual({
      status: 403,
      code: 'AUTH_ACCOUNT_DISABLED',
      message: 'Account is disabled',
    })
    expect(wrongPassword).toEqual({
      status: 401,
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    })
  })
})

describe('AuthService.refresh', () => {
  it('rotates: issues a new pair, revokes the old row, keeps the new row active', async () => {
    const { service, refreshTokenRepository } = await setup()
    const login = await service.login({ username: 'admin', password: PASSWORD })

    const rotated = await service.refresh({ refreshToken: login.refreshToken })

    expect(rotated.refreshToken).not.toBe(login.refreshToken)
    expect(rotated.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const oldRow = refreshTokenRepository
      .all()
      .find((row) => row.tokenHash === sha256(login.refreshToken))
    const newRow = refreshTokenRepository
      .all()
      .find((row) => row.tokenHash === sha256(rotated.refreshToken))
    expect(oldRow?.revokedAt).not.toBeNull()
    expect(newRow?.revokedAt).toBeNull()
  })

  it('treats reuse of a rotated token as theft: revokes every token of the user', async () => {
    const { service, refreshTokenRepository } = await setup()
    const login = await service.login({ username: 'admin', password: PASSWORD })
    const rotated = await service.refresh({ refreshToken: login.refreshToken })

    const replay = await errorFields(() => service.refresh({ refreshToken: login.refreshToken }))

    expect(replay).toEqual({
      status: 401,
      code: 'AUTH_INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token',
    })
    for (const row of refreshTokenRepository.all()) {
      expect(row.revokedAt).not.toBeNull()
    }
    const followUp = await errorFields(() =>
      service.refresh({ refreshToken: rotated.refreshToken }),
    )
    expect(followUp.status).toBe(401)
  })

  it('rejects an expired token without revoking anything', async () => {
    const { service, refreshTokenRepository, admin } = await setup()
    const expiredRaw = randomBytes(32).toString('base64url')
    await refreshTokenRepository.insert({
      userId: admin.id,
      tokenHash: sha256(expiredRaw),
      expiresAt: new Date(Date.now() - 1000),
    })

    const result = await errorFields(() => service.refresh({ refreshToken: expiredRaw }))

    expect(result.status).toBe(401)
    expect(result.code).toBe('AUTH_INVALID_REFRESH_TOKEN')
    expect(refreshTokenRepository.all().every((row) => row.revokedAt === null)).toBe(true)
  })

  it('rejects an unknown token without side effects', async () => {
    const { service } = await setup()
    const unknownRaw = randomBytes(32).toString('base64url')

    const result = await errorFields(() => service.refresh({ refreshToken: unknownRaw }))

    expect(result).toEqual({
      status: 401,
      code: 'AUTH_INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token',
    })
  })

  it('stops a disabled user from minting sessions: rejects and revokes everything', async () => {
    const { service, userRepository } = await setup()
    const login = await service.login({ username: 'admin', password: PASSWORD })
    userRepository.setStatus(login.user.id, 'disabled')

    const result = await errorFields(() => service.refresh({ refreshToken: login.refreshToken }))

    expect(result.status).toBe(401)
    expect(result.code).toBe('AUTH_INVALID_REFRESH_TOKEN')
  })
})

describe('AuthService.logout', () => {
  it('revokes the presented token', async () => {
    const { service, refreshTokenRepository } = await setup()
    const login = await service.login({ username: 'admin', password: PASSWORD })

    await expect(service.logout({ refreshToken: login.refreshToken })).resolves.toEqual({
      revoked: true,
    })

    const row = refreshTokenRepository
      .all()
      .find((token) => token.tokenHash === sha256(login.refreshToken))
    expect(row?.revokedAt).not.toBeNull()
  })

  it('rejects an unknown refresh token', async () => {
    const { service } = await setup()
    const result = await errorFields(() =>
      service.logout({ refreshToken: randomBytes(32).toString('base64url') }),
    )
    expect(result).toEqual({
      status: 401,
      code: 'AUTH_INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token',
    })
  })

  it('rejects an already-revoked refresh token without further side effects', async () => {
    const { service, refreshTokenRepository } = await setup()
    const first = await service.login({ username: 'admin', password: PASSWORD })
    const second = await service.login({ username: 'admin', password: PASSWORD })
    await service.logout({ refreshToken: first.refreshToken })

    const result = await errorFields(() => service.logout({ refreshToken: first.refreshToken }))

    expect(result.status).toBe(401)
    const secondRow = refreshTokenRepository
      .all()
      .find((token) => token.tokenHash === sha256(second.refreshToken))
    expect(secondRow?.revokedAt).toBeNull()
  })
})

describe('AuthService.getCurrentUser', () => {
  it('returns the public user for an active account', async () => {
    const { service, admin } = await setup()
    await expect(service.getCurrentUser(admin.id)).resolves.toEqual({
      id: admin.id,
      username: 'admin',
      displayName: null,
      role: 'admin',
      status: 'active',
    })
  })

  it('returns UNAUTHORIZED when the id resolves to no user', async () => {
    const { service } = await setup()
    const result = await errorFields(() => service.getCurrentUser('missing-user'))
    expect(result).toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    })
  })

  it('returns AUTH_ACCOUNT_DISABLED for a disabled account (fresh read)', async () => {
    const { service, userRepository, admin } = await setup()
    userRepository.setStatus(admin.id, 'disabled')

    const result = await errorFields(() => service.getCurrentUser(admin.id))
    expect(result).toEqual({
      status: 403,
      code: 'AUTH_ACCOUNT_DISABLED',
      message: 'Account is disabled',
    })
  })
})
