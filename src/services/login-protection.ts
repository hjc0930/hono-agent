import { env } from '../config/env.ts'
import { accountLockedError, rateLimitedError } from '../lib/errors.ts'

export interface LoginAttemptTracker {
  /** Throws AUTH_RATE_LIMITED (IP) or AUTH_ACCOUNT_LOCKED (account) when blocked. */
  assertAllowed(ip: string, username: string): void
  recordFailure(ip: string, username: string): void
  recordSuccess(username: string): void
}

type Clock = () => number

type AccountState = {
  failures: number
  lockedUntil: number
}

export type LoginAttemptTrackerOptions = {
  now?: Clock
  maxFailures?: number
  lockoutSeconds?: number
  ipFailureLimit?: number
  ipWindowSeconds?: number
}

export const createMemoryLoginAttemptTracker = (
  options: LoginAttemptTrackerOptions = {},
): LoginAttemptTracker => {
  const now = options.now ?? (() => Date.now())
  const maxFailures = options.maxFailures ?? env.AUTH_MAX_LOGIN_FAILURES
  const lockoutSeconds = options.lockoutSeconds ?? env.AUTH_LOCKOUT_SECONDS
  const ipFailureLimit = options.ipFailureLimit ?? env.AUTH_IP_FAILURE_LIMIT
  const ipWindowSeconds = options.ipWindowSeconds ?? env.AUTH_IP_WINDOW_SECONDS

  const accounts = new Map<string, AccountState>()
  const ipFailures = new Map<string, number[]>()

  const ipBlocked = (ip: string): boolean => {
    const windowStart = now() - ipWindowSeconds * 1000
    const timestamps = (ipFailures.get(ip) ?? []).filter((at) => at > windowStart)
    ipFailures.set(ip, timestamps)
    return timestamps.length >= ipFailureLimit
  }

  const accountLocked = (username: string): boolean => {
    const state = accounts.get(username)
    if (!state) return false
    if (state.lockedUntil > now()) return true
    // A lock that just expired clears the account so the next failure streak
    // starts fresh; an account still accumulating failures (lockedUntil === 0)
    // keeps its count.
    if (state.lockedUntil > 0) accounts.delete(username)
    return false
  }

  return {
    assertAllowed(ip, username) {
      if (ipBlocked(ip)) throw rateLimitedError()
      if (accountLocked(username)) throw accountLockedError()
    },

    recordFailure(ip, username) {
      const windowStart = now() - ipWindowSeconds * 1000
      const timestamps = (ipFailures.get(ip) ?? []).filter((at) => at > windowStart)
      timestamps.push(now())
      ipFailures.set(ip, timestamps)

      const state = accounts.get(username) ?? { failures: 0, lockedUntil: 0 }
      const failures = state.failures + 1
      if (failures >= maxFailures) {
        accounts.set(username, { failures, lockedUntil: now() + lockoutSeconds * 1000 })
      } else {
        accounts.set(username, { failures, lockedUntil: 0 })
      }
    },

    recordSuccess(username) {
      accounts.delete(username)
    },
  }
}
