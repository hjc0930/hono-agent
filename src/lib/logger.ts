import pino from 'pino'

import { env } from '../config/env.ts'

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: Boolean(process.stdout.isTTY),
            translateTime: 'SYS:standard',
          },
        },
      }
    : {}),
})
