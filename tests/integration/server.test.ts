import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { app } from '../../src/main.ts'
import {
  formatServerStartupMessage,
  getServerAddresses,
  listenOnFirstAvailablePort,
} from '../../src/server.ts'

const servers: Array<{ close: (callback: (error?: Error) => void) => void }> = []

const closeServer = (server: { close: (callback: (error?: Error) => void) => void }) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer))
})

describe('server startup', () => {
  it('reports the application, Swagger, and OpenAPI URLs for the listening port', () => {
    expect(getServerAddresses(4301)).toEqual({
      application: 'http://localhost:4301',
      openApi: 'http://localhost:4301/openapi.json',
      swagger: 'http://localhost:4301/docs',
    })
  })

  it('formats startup URLs for terminal readability', () => {
    expect(formatServerStartupMessage(4301)).toBe(`
╭─ Hono Agent server is ready ───────────────────────────
│ Application  http://localhost:4301
│ Swagger UI   http://localhost:4301/docs
│ OpenAPI JSON http://localhost:4301/openapi.json
╰────────────────────────────────────────────────────────`)
  })

  it('uses the next available port when the configured port is occupied', async () => {
    const occupyingServer = createServer()
    servers.push(occupyingServer)
    await new Promise<void>((resolve) => occupyingServer.listen(0, resolve))
    const occupiedPort = (occupyingServer.address() as AddressInfo).port

    const applicationServer = await listenOnFirstAvailablePort(
      app.fetch,
      occupiedPort,
      occupiedPort + 10,
    )
    servers.push(applicationServer)
    const actualPort = (applicationServer.address() as AddressInfo).port

    expect(actualPort).toBeGreaterThan(occupiedPort)
  })
})
