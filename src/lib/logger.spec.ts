import { afterEach, describe, expect, it, vi } from 'vitest'

const { createLogger, config } = vi.hoisted(() => ({
  createLogger: vi.fn(() => ({})),
  config: { NODE_ENV: 'test', LOG_LEVEL: 'debug' },
}))

vi.mock('pino', () => ({ default: createLogger }))
vi.mock('../config/env.ts', () => ({ env: config }))

const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')

afterEach(() => {
  if (ttyDescriptor) Object.defineProperty(process.stdout, 'isTTY', ttyDescriptor)
  else Reflect.deleteProperty(process.stdout, 'isTTY')
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.resetModules()
})

describe('logger output', () => {
  it.each(['production', 'test'])('keeps %s logs as JSON with redaction', async (environment) => {
    config.NODE_ENV = environment
    await import('./logger.ts')
    expect(createLogger).toHaveBeenCalledWith({
      level: 'debug',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    })
  })

  it.each([true, false])('uses readable development logs with TTY=%s', async (tty) => {
    config.NODE_ENV = 'development'
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: tty })
    await import('./logger.ts')
    expect(createLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        transport: {
          target: 'pino-pretty',
          options: { colorize: tty, translateTime: 'SYS:standard' },
        },
      }),
    )
  })
})
