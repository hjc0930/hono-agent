import { describe, expect, it } from 'vitest'

import { createApp } from '../main.ts'

describe('GET /health', () => {
  it('returns the health payload in the common envelope and a request ID header', async () => {
    const response = await createApp().request('/health')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(body).toMatchObject({
      path: '/health',
      message: 'OK',
      code: 'OK',
      data: { status: 'ok' },
    })
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('publishes the OpenAPI document and Swagger UI', async () => {
    const app = createApp()
    const [openApiResponse, docsResponse] = await Promise.all([
      app.request('/openapi.json'),
      app.request('/docs'),
    ])

    expect(openApiResponse.status).toBe(200)
    await expect(openApiResponse.json()).resolves.toMatchObject({
      openapi: '3.1.0',
    })
    expect(docsResponse.status).toBe(200)
    await expect(docsResponse.text()).resolves.toContain('SwaggerUI')
  })
})
