import type { Logger } from 'pino'

type ShutdownServer = {
  close: (callback: (error?: Error) => void) => unknown
  closeAllConnections?: () => void
}

type ShutdownProcess = {
  on: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) => unknown
  off: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) => unknown
  exitCode?: NodeJS.Process['exitCode']
  exit: (code: number) => void
}

export const registerGracefulShutdown = (
  server: ShutdownServer,
  options: {
    closeDatabase: () => Promise<void>
    logger: Pick<Logger, 'info' | 'error' | 'flush'>
    timeoutMs: number
    processTarget?: ShutdownProcess
  },
) => {
  const { closeDatabase, logger, timeoutMs } = options
  const processTarget: ShutdownProcess = options.processTarget ?? process
  let shutdownPromise: Promise<void> | undefined
  let finished = false

  const removeListeners = () => {
    processTarget.off('SIGINT', onSigint)
    processTarget.off('SIGTERM', onSigterm)
  }

  const forceCloseConnections = () => {
    try {
      server.closeAllConnections?.()
    } catch (error) {
      logger.error({ err: error }, 'failed to force-close HTTP connections')
    }
  }

  const runShutdown = async (reason: string) => {
    let failed = false
    logger.info({ reason, timeoutMs }, 'graceful shutdown started')
    const deadline = setTimeout(() => {
      finished = true
      processTarget.exitCode = 1
      removeListeners()
      forceCloseConnections()
      logger.error({ timeoutMs }, 'graceful shutdown timed out; forcing exit')
      try {
        logger.flush()
      } catch {
        // The deadline has expired; log-flush failures must not prevent exit.
      } finally {
        processTarget.exit(1)
      }
    }, timeoutMs)

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
            reject(error)
          } else {
            resolve()
          }
        })
      })
    } catch (error) {
      if (finished) return
      failed = true
      logger.error({ err: error }, 'failed to drain HTTP server')
      forceCloseConnections()
    }
    if (finished) return

    try {
      await closeDatabase()
    } catch (error) {
      if (finished) return
      failed = true
      logger.error({ err: error }, 'failed to close database')
    }
    if (finished) return

    logger.info({ failed }, 'shutdown cleanup finished')
    try {
      await new Promise<void>((resolve, reject) => {
        logger.flush((error) => (error ? reject(error) : resolve()))
      })
    } catch (error) {
      if (finished) return
      failed = true
      logger.error({ err: error }, 'failed to flush shutdown logs')
    }
    if (finished) return

    finished = true
    clearTimeout(deadline)
    removeListeners()
    processTarget.exitCode = failed ? 1 : (processTarget.exitCode ?? 0)
    if (failed) processTarget.exit(1)
  }

  const shutdown = (reason = 'manual') => (shutdownPromise ??= runShutdown(reason))
  const onSigint = () => {
    void shutdown('SIGINT')
  }
  const onSigterm = () => {
    void shutdown('SIGTERM')
  }
  processTarget.on('SIGINT', onSigint)
  processTarget.on('SIGTERM', onSigterm)
  return shutdown
}
