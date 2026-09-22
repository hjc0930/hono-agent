import { describe, expect, it } from 'vitest'

import { createApp } from '../main.ts'

describe('GET /health', () => {
  it('returns the documented health payload and request ID', async () => {
    const response = await createApp().request('/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBeTruthy()
    await expect(response.json()).resolves.toEqual({
      data: { status: 'ok' },
    })
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
