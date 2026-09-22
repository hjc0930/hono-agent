import { describe, expect, it } from 'vitest'

import { createApp } from '../main.ts'
import { AppError } from '../lib/errors.ts'

describe('error responses', () => {
  it('returns a stable JSON response for a known application error', async () => {
    const app = createApp()
    app.get('/known-error', () => {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request')
    })

    const response = await app.request('/known-error', {
      headers: { 'x-request-id': 'test-request-id' },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: 'test-request-id',
      },
    })
  })

  it('does not expose unexpected error details', async () => {
    const app = createApp()
    app.get('/unexpected-error', () => {
      throw new Error('database password must stay private')
    })

    const response = await app.request('/unexpected-error')
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    })
    expect(JSON.stringify(body)).not.toContain('database password')
  })
})
