import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

import { corsOrigins } from '../config/env.ts'

export const securityHeaders = secureHeaders()

export const apiCors = cors({
  origin: (origin) => (corsOrigins.includes(origin) ? origin : undefined),
})
