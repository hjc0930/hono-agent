import { describe, expect, it } from 'vitest'

import { createMemoryLoginAttemptTracker } from './login-protection.ts'

const captureError = (
  run: () => void,
): { status: number | undefined; code: string | undefined } | null => {
  try {
    run()
    return null
  } catch (error) {
    return {
      status: (error as { status?: number }).status,
      code: (error as { code?: string }).code,
    }
  }
}

describe('login attempt tracker — account lockout', () => {
  it('allows failures below the threshold', () => {
    const tracker = createMemoryLoginAttemptTracker({ maxFailures: 3 })
    tracker.recordFailure('ip', 'alice')
    tracker.recordFailure('ip', 'alice')
    expect(captureError(() => tracker.assertAllowed('ip', 'alice'))).toBeNull()
  })

  it('locks the account at the threshold', () => {
    const tracker = createMemoryLoginAttemptTracker({ maxFailures: 3 })
    tracker.recordFailure('ip', 'alice')
    tracker.recordFailure('ip', 'alice')
    tracker.recordFailure('ip', 'alice')

    const error = captureError(() => tracker.assertAllowed('ip', 'alice'))
    expect(error).toEqual({ status: 423, code: 'AUTH_ACCOUNT_LOCKED' })
  })

  it('expires the lockout after the window', () => {
    let time = 0
    const tracker = createMemoryLoginAttemptTracker({
      maxFailures: 2,
      lockoutSeconds: 60,
      now: () => time,
    })
    tracker.recordFailure('ip', 'alice')
    tracker.recordFailure('ip', 'alice')
    expect(captureError(() => tracker.assertAllowed('ip', 'alice'))?.code).toBe(
      'AUTH_ACCOUNT_LOCKED',
    )

    time += 61_000
    expect(captureError(() => tracker.assertAllowed('ip', 'alice'))).toBeNull()
  })

  it('success resets the failure streak', () => {
    const tracker = createMemoryLoginAttemptTracker({ maxFailures: 2 })
    tracker.recordFailure('ip', 'alice')
    tracker.recordSuccess('alice')
    tracker.recordFailure('ip', 'alice')
    expect(captureError(() => tracker.assertAllowed('ip', 'alice'))).toBeNull()
  })

  it('does not reset the streak when assertAllowed runs between failures', () => {
    const tracker = createMemoryLoginAttemptTracker({ maxFailures: 2 })
    tracker.recordFailure('ip', 'alice')
    tracker.assertAllowed('ip', 'alice')
    tracker.recordFailure('ip', 'alice')

    const error = captureError(() => tracker.assertAllowed('ip', 'alice'))
    expect(error?.code).toBe('AUTH_ACCOUNT_LOCKED')
  })
})

describe('login attempt tracker — IP rate limit', () => {
  it('blocks after the IP failure limit', () => {
    const tracker = createMemoryLoginAttemptTracker({ ipFailureLimit: 2 })
    tracker.recordFailure('1.2.3.4', 'alice')
    tracker.recordFailure('1.2.3.4', 'bob')

    const error = captureError(() => tracker.assertAllowed('1.2.3.4', 'carol'))
    expect(error).toEqual({ status: 429, code: 'AUTH_RATE_LIMITED' })
  })

  it('does not block a different IP', () => {
    const tracker = createMemoryLoginAttemptTracker({ ipFailureLimit: 2 })
    tracker.recordFailure('1.2.3.4', 'alice')
    tracker.recordFailure('1.2.3.4', 'bob')
    expect(captureError(() => tracker.assertAllowed('5.6.7.8', 'carol'))).toBeNull()
  })

  it('evicts expired IP failures', () => {
    let time = 0
    const tracker = createMemoryLoginAttemptTracker({
      ipFailureLimit: 2,
      ipWindowSeconds: 60,
      now: () => time,
    })
    tracker.recordFailure('1.2.3.4', 'alice')
    tracker.recordFailure('1.2.3.4', 'bob')
    time += 61_000
    expect(captureError(() => tracker.assertAllowed('1.2.3.4', 'carol'))).toBeNull()
  })
})

describe('login attempt tracker — ordering', () => {
  it('checks the IP limit before the account lockout', () => {
    const tracker = createMemoryLoginAttemptTracker({ maxFailures: 1, ipFailureLimit: 1 })
    tracker.recordFailure('1.2.3.4', 'alice')

    const error = captureError(() => tracker.assertAllowed('1.2.3.4', 'alice'))
    expect(error?.code).toBe('AUTH_RATE_LIMITED')
  })
})
