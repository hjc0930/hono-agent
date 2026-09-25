import { createHash, randomBytes } from 'node:crypto'

import { env } from '../config/env.ts'
import { signAccessToken } from '../lib/access-token.ts'
import { AppError, unauthorizedError } from '../lib/errors.ts'
import { verifyDummyPassword, verifyPassword } from '../lib/password.ts'
import type { RefreshTokenRepository } from '../repositories/refresh-token-repository.ts'
import type { UserRecord } from '../repositories/user-repository.ts'
import type { UserRepository } from '../repositories/user-repository.ts'

export type PublicUser = {
  id: string
  username: string
  displayName: string | null
  role: UserRecord['role']
  status: UserRecord['status']
}

export type LoginResult = {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  refreshToken: string
  user: PublicUser
}

export type RefreshResult = {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  refreshToken: string
}

const accountDisabledError = () => new AppError(403, 'AUTH_ACCOUNT_DISABLED', 'Account is disabled')

const invalidRefreshTokenError = () =>
  new AppError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token')

const hashRefreshToken = (rawToken: string): string =>
  createHash('sha256').update(rawToken).digest('hex')

const generateRefreshToken = (): string => randomBytes(32).toString('base64url')

const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  status: user.status,
})

export type AuthService = {
  login(input: { username: string; password: string }): Promise<LoginResult>
  refresh(input: { refreshToken: string }): Promise<RefreshResult>
  logout(input: { refreshToken: string }): Promise<{ revoked: boolean }>
  getCurrentUser(userId: string): Promise<PublicUser>
}

export const createAuthService = (dependencies: {
  userRepository: UserRepository
  refreshTokenRepository: RefreshTokenRepository
}): AuthService => {
  const { userRepository, refreshTokenRepository } = dependencies

  const issueTokenPair = async (user: UserRecord): Promise<LoginResult> => {
    const accessToken = await signAccessToken({ sub: user.id, role: user.role })
    const refreshToken = generateRefreshToken()
    await refreshTokenRepository.insert({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000),
    })
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      user: toPublicUser(user),
    }
  }

  return {
    async login(input) {
      // Constructed once so the unknown-user and wrong-password failures render
      // identical bodies, including the non-production stack.
      const invalidCredentials = new AppError(
        401,
        'AUTH_INVALID_CREDENTIALS',
        'Invalid username or password',
      )
      const user = await userRepository.findByUsername(input.username)
      if (!user) {
        // Equalize timing with the wrong-password path so usernames cannot be probed.
        await verifyDummyPassword(input.password)
        throw invalidCredentials
      }

      const passwordMatches = await verifyPassword(input.password, user.passwordHash)
      if (!passwordMatches) throw invalidCredentials
      if (user.status === 'disabled') throw accountDisabledError()

      return issueTokenPair(user)
    },

    async refresh(input) {
      const tokenHash = hashRefreshToken(input.refreshToken)
      const stored = await refreshTokenRepository.findByHash(tokenHash)
      if (!stored) throw invalidRefreshTokenError()

      if (stored.revokedAt !== null) {
        // Reuse of a rotated or revoked token is treated as theft: kill every session.
        await refreshTokenRepository.revokeAllForUser(stored.userId)
        throw invalidRefreshTokenError()
      }
      if (stored.expiresAt.getTime() <= Date.now()) throw invalidRefreshTokenError()

      const user = await userRepository.findById(stored.userId)
      if (!user || user.status === 'disabled') {
        // A disabled user must not mint new sessions; the staleness budget ends here.
        await refreshTokenRepository.revokeAllForUser(stored.userId)
        throw invalidRefreshTokenError()
      }

      const oldRevoked = await refreshTokenRepository.revoke(stored.id)
      if (!oldRevoked) {
        await refreshTokenRepository.revokeAllForUser(stored.userId)
        throw invalidRefreshTokenError()
      }

      return issueTokenPair(user)
    },

    async logout(input) {
      const tokenHash = hashRefreshToken(input.refreshToken)
      const stored = await refreshTokenRepository.findByHash(tokenHash)
      if (!stored || stored.revokedAt !== null) throw invalidRefreshTokenError()

      await refreshTokenRepository.revoke(stored.id)
      return { revoked: true }
    },

    async getCurrentUser(userId) {
      const user = await userRepository.findById(userId)
      if (!user) throw unauthorizedError()
      if (user.status === 'disabled') throw accountDisabledError()
      return toPublicUser(user)
    },
  }
}
