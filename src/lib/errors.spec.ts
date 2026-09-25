import { describe, expect, it } from 'vitest'

import { forbiddenError, notFoundError, unauthorizedError } from './errors.ts'

describe('error constructors', () => {
  it('unauthorizedError produces 401/UNAUTHORIZED with the stable message', () => {
    const error = unauthorizedError()
    expect(error.status).toBe(401)
    expect(error.code).toBe('UNAUTHORIZED')
    expect(error.message).toBe('Authentication required')
  })

  it('forbiddenError produces 403/FORBIDDEN with the stable message', () => {
    const error = forbiddenError()
    expect(error.status).toBe(403)
    expect(error.code).toBe('FORBIDDEN')
    expect(error.message).toBe('Insufficient permissions')
  })

  it('notFoundError produces 404/NOT_FOUND with the stable message', () => {
    const error = notFoundError()
    expect(error.status).toBe(404)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toBe('Route not found')
  })
})
