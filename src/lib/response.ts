import { env } from '../config/env.ts'

export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type SuccessEnvelope<T> = {
  path: string
  date: string
  message: string
  code: 'OK'
  data?: T | null
  meta?: PaginationMeta
}

export type FailureErrorDetails = {
  message: string[]
  stack?: string
}

export type FailureEnvelope = {
  path: string
  date: string
  message: string
  code: string
  errors: FailureErrorDetails
}

const nowIso = () => new Date().toISOString()

// Read at call time (not from the parsed env object) so tests can stub NODE_ENV per case.
// Stack traces must never reach production clients; non-production needs them for debugging.
const currentEnv = (): string => process.env.NODE_ENV ?? env.NODE_ENV

const stackFor = (error: unknown): string | undefined => {
  if (currentEnv() === 'production') return undefined
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}

const normalizeDetails = (details: unknown, fallback: string): string[] => {
  if (Array.isArray(details)) {
    const entries = details.map((entry) =>
      typeof entry === 'string' ? entry : JSON.stringify(entry),
    )
    if (entries.length > 0) return entries
  }
  if (typeof details === 'string' && details.length > 0) return [details]
  return [fallback]
}

export const successEnvelope = <T>(options: {
  path: string
  data?: T | null
  message?: string
  meta?: PaginationMeta
}): SuccessEnvelope<T> => {
  const envelope: SuccessEnvelope<T> = {
    path: options.path,
    date: nowIso(),
    message: options.message ?? 'OK',
    code: 'OK',
  }
  if (options.data !== undefined) envelope.data = options.data
  if (options.meta !== undefined) envelope.meta = options.meta
  return envelope
}

export type PaginatedEnvelope<T> = {
  path: string
  date: string
  message: string
  code: 'OK'
  data: T[]
  meta: PaginationMeta
}

// List responses carry a required array `data` plus pagination `meta`, so they use
// this narrower builder instead of `successEnvelope`.
export const paginatedEnvelope = <T>(options: {
  path: string
  data: T[]
  meta: PaginationMeta
  message?: string
}): PaginatedEnvelope<T> => ({
  path: options.path,
  date: nowIso(),
  message: options.message ?? 'OK',
  code: 'OK',
  data: options.data,
  meta: options.meta,
})

export const failureEnvelope = (options: {
  path: string
  code: string
  message: string
  errorDetails?: unknown
  error?: unknown
}): FailureEnvelope => {
  const errors: FailureErrorDetails = {
    message: normalizeDetails(options.errorDetails, options.message),
  }
  const stack = stackFor(options.error)
  if (stack !== undefined) errors.stack = stack
  return {
    path: options.path,
    date: nowIso(),
    message: options.message,
    code: options.code,
    errors,
  }
}
