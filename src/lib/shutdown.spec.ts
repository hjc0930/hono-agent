import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerGracefulShutdown } from './shutdown.ts'

const setup = () => {
  vi.useFakeTimers()
  let finishHttp!: (error?: Error) => void
  const server = {
    close: vi.fn((callback: (error?: Error) => void) => {
      finishHttp = callback
    }),
    closeAllConnections: vi.fn(),
  }
  const processTarget = Object.assign(new EventEmitter(), {
    exitCode: undefined as number | string | undefined,
    exit: vi.fn<(code: number) => void>(),
  })
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    flush: vi.fn((callback?: (error?: Error) => void) => callback?.()),
  }
  const closeDatabase = vi.fn(async () => {})
  const shutdown = registerGracefulShutdown(server, {
    processTarget,
    logger,
    closeDatabase,
    timeoutMs: 1000,
  })
  return {
    server,
    processTarget,
    logger,
    closeDatabase,
    shutdown,
    finishHttp: (error?: Error) => finishHttp(error),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('graceful shutdown', () => {
  it.each(['SIGINT', 'SIGTERM'])(
    'drains HTTP before closing the database on %s',
    async (signal) => {
      const app = setup()
      app.processTarget.emit(signal)
      expect(app.server.close).toHaveBeenCalledTimes(1)
      expect(app.closeDatabase).not.toHaveBeenCalled()
      expect(app.logger.info).toHaveBeenCalledWith(
        { reason: signal, timeoutMs: 1000 },
        'graceful shutdown started',
      )
      app.finishHttp()
      await app.shutdown()
      expect(app.closeDatabase).toHaveBeenCalledTimes(1)
      expect(app.logger.flush).toHaveBeenCalledTimes(1)
      expect(app.processTarget.exitCode).toBe(0)
      expect(app.processTarget.exit).not.toHaveBeenCalled()
      expect(app.server.closeAllConnections).not.toHaveBeenCalled()
      expect(app.processTarget.listenerCount('SIGINT')).toBe(0)
      expect(app.processTarget.listenerCount('SIGTERM')).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('shares cleanup and the deadline across repeated signals and calls', async () => {
    const app = setup()
    const first = app.shutdown()
    await vi.advanceTimersByTimeAsync(400)
    app.processTarget.emit('SIGINT')
    app.processTarget.emit('SIGTERM')
    expect(app.shutdown()).toBe(first)
    expect(app.server.close).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(600)
    expect(app.processTarget.exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(app.server.closeAllConnections).toHaveBeenCalledTimes(1)
    app.finishHttp()
    await first
    expect(app.closeDatabase).not.toHaveBeenCalled()
    expect(app.processTarget.exitCode).toBe(1)
  })

  it('waits for database closure before flushing logs or completing', async () => {
    const app = setup()
    let finishDatabase!: () => void
    app.closeDatabase.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDatabase = resolve
        }),
    )
    const done = app.shutdown()
    app.finishHttp()
    await vi.advanceTimersByTimeAsync(0)
    expect(app.logger.flush).not.toHaveBeenCalled()
    expect(app.processTarget.exitCode).toBeUndefined()
    finishDatabase()
    await done
    expect(app.logger.flush).toHaveBeenCalledTimes(1)
  })

  it.each(['database', 'logs'])(
    'forces exit when %s cleanup exceeds the deadline',
    async (phase) => {
      const app = setup()
      if (phase === 'database') app.closeDatabase.mockImplementation(() => new Promise(() => {}))
      else app.logger.flush.mockImplementation(() => {})
      void app.shutdown()
      app.finishHttp()
      await vi.advanceTimersByTimeAsync(999)
      expect(app.processTarget.exit).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(app.processTarget.exit).toHaveBeenCalledExactlyOnceWith(1)
      expect(app.processTarget.listenerCount('SIGTERM')).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('continues cleanup after an HTTP drain failure and exits unsuccessfully', async () => {
    const app = setup()
    const done = app.shutdown()
    app.finishHttp(new Error('HTTP close failed'))
    await done
    expect(app.server.closeAllConnections).toHaveBeenCalledTimes(1)
    expect(app.closeDatabase).toHaveBeenCalledTimes(1)
    expect(app.logger.flush).toHaveBeenCalledTimes(1)
    expect(app.processTarget.exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles a synchronous HTTP close exception', async () => {
    const app = setup()
    app.server.close.mockImplementation(() => {
      throw new Error('close failed')
    })
    await app.shutdown()
    expect(app.closeDatabase).toHaveBeenCalledTimes(1)
    expect(app.processTarget.exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('treats an already closed HTTP server as drained', async () => {
    const app = setup()
    const done = app.shutdown()
    app.finishHttp(Object.assign(new Error('not running'), { code: 'ERR_SERVER_NOT_RUNNING' }))
    await done
    expect(app.closeDatabase).toHaveBeenCalledTimes(1)
    expect(app.processTarget.exitCode).toBe(0)
  })

  it.each(['database', 'logs'])('reports a %s failure and exits with code 1', async (phase) => {
    const app = setup()
    const error = new Error(`${phase} failure`)
    if (phase === 'database') app.closeDatabase.mockRejectedValue(error)
    else app.logger.flush.mockImplementation((callback) => callback?.(error))
    const done = app.shutdown()
    app.finishHttp()
    await done
    expect(app.logger.error).toHaveBeenCalledWith({ err: error }, expect.any(String))
    expect(app.processTarget.exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still forces exit if connection destruction or timeout log flushing throws', async () => {
    const app = setup()
    app.server.closeAllConnections.mockImplementation(() => {
      throw new Error('destroy failed')
    })
    app.logger.flush.mockImplementation(() => {
      throw new Error('flush failed')
    })
    void app.shutdown()
    await vi.advanceTimersByTimeAsync(1000)
    expect(app.processTarget.exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('preserves an existing failure exit code on successful cleanup', async () => {
    const app = setup()
    app.processTarget.exitCode = 2
    const done = app.shutdown()
    app.finishHttp()
    await done
    expect(app.processTarget.exitCode).toBe(2)
    expect(app.processTarget.exit).not.toHaveBeenCalled()
  })
})
