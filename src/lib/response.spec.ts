import { afterEach, describe, expect, it, vi } from 'vitest'

import { failureEnvelope, successEnvelope } from './response.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('successEnvelope', () => {
  it('wraps a payload with the common envelope fields', () => {
    const envelope = successEnvelope({ path: '/api/auth/me', data: { id: 'u1' } })
    expect(envelope.path).toBe('/api/auth/me')
    expect(envelope.date).toMatch(ISO_DATE)
    expect(envelope.message).toBe('OK')
    expect(envelope.code).toBe('OK')
    expect(envelope.data).toEqual({ id: 'u1' })
  })

  it('keeps explicit null data in the body', () => {
    const envelope = successEnvelope<{ id: string } | null>({ path: '/x', data: null })
    expect('data' in envelope).toBe(true)
    expect(envelope.data).toBeNull()
  })

  it('omits the data key entirely when the mutation returns nothing', () => {
    const envelope = successEnvelope({ path: '/api/auth/logout' })
    expect('data' in envelope).toBe(false)
  })

  it('allows an operation-specific message override', () => {
    const envelope = successEnvelope({ path: '/x', message: 'Logged in' })
    expect(envelope.message).toBe('Logged in')
  })
})

describe('failureEnvelope', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults errors.message to the top-level message', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const envelope = failureEnvelope({
      path: '/api/auth/login',
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    })
    expect(envelope.code).toBe('AUTH_INVALID_CREDENTIALS')
    expect(envelope.errors.message).toEqual(['Invalid username or password'])
    expect(envelope.date).toMatch(ISO_DATE)
  })

  it('maps error details into the errors.message string array', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const envelope = failureEnvelope({
      path: '/api/auth/login',
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errorDetails: ['username: must match /^[a-z0-9_-]{3,32}$/'],
    })
    expect(envelope.errors.message).toEqual(['username: must match /^[a-z0-9_-]{3,32}$/'])
  })

  it('includes the stack in non-production environments', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const envelope = failureEnvelope({
      path: '/x',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      error: new Error('boom'),
    })
    expect(envelope.errors.stack).toContain('boom')
  })

  it('never includes the stack in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const envelope = failureEnvelope({
      path: '/x',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      error: new Error('secret database password'),
    })
    expect('stack' in envelope.errors).toBe(false)
    expect(JSON.stringify(envelope)).not.toContain('secret database password')
  })
})
