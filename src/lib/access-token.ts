import { sign, verify } from 'hono/jwt'

import { env } from '../config/env.ts'
import type { UserRole } from '../types.ts'

export type AccessTokenPayload = {
  sub: string
  role: UserRole
}

const isUserRole = (value: unknown): value is UserRole =>
  value === 'admin' || value === 'agent' || value === 'user'

export const signAccessToken = async (payload: AccessTokenPayload): Promise<string> => {
  const issuedAt = Math.floor(Date.now() / 1000)
  return sign(
    {
      sub: payload.sub,
      role: payload.role,
      iat: issuedAt,
      exp: issuedAt + env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    },
    env.JWT_SECRET,
    'HS256',
  )
}

export const verifyAccessToken = async (token: string): Promise<AccessTokenPayload | null> => {
  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256')
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
    if (!isUserRole(payload.role)) return null
    return { sub: payload.sub, role: payload.role }
  } catch {
    return null
  }
}
