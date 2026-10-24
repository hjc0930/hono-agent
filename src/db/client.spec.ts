import { beforeEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({
  databaseConfig: { type: 'pglite' as 'pglite' | 'postgres', url: '.data/pglite' },
  mkdir: vi.fn(),
  end: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  pg: vi.fn(),
  pglite: vi.fn(),
  createPglite: vi.fn(),
}))

vi.mock('../config/env.ts', () => ({
  databaseConfig: doubles.databaseConfig,
  PGLITE_MEMORY_URL: 'memory://',
}))
vi.mock('node:fs', () => ({ mkdirSync: doubles.mkdir }))
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: doubles.pg }))
vi.mock('drizzle-orm/pglite', () => ({ drizzle: doubles.pglite }))
vi.mock('@electric-sql/pglite', () => ({
  PGlite: class {
    close = doubles.close
    constructor(path: string) {
      doubles.createPglite(path)
    }
  },
}))

const configure = (type: 'pglite' | 'postgres', url: string) => {
  doubles.databaseConfig.type = type
  doubles.databaseConfig.url = url
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  configure('pglite', '.data/pglite')
  doubles.pg.mockImplementation(() => ({ $client: { end: doubles.end } }))
  doubles.pglite.mockImplementation((client) => ({ $client: client }))
})

describe('database lifecycle', () => {
  it('does not create a database when closing an unused client', async () => {
    const { getDatabase, closeDatabase } = await import('./client.ts')
    await closeDatabase()
    expect(doubles.pg).not.toHaveBeenCalled()
    expect(doubles.createPglite).not.toHaveBeenCalled()
    expect(doubles.mkdir).not.toHaveBeenCalled()
    expect(() => getDatabase()).toThrow('Database is shutting down')
  })

  it.each(['postgres', 'pglite'])(
    'closes an initialized %s client exactly once',
    async (driver) => {
      if (driver === 'postgres') configure('postgres', 'postgresql://localhost/test')
      const { getDatabase, closeDatabase } = await import('./client.ts')
      expect(getDatabase()).toBe(getDatabase())
      const first = closeDatabase()
      expect(closeDatabase()).toBe(first)
      expect(() => getDatabase()).toThrow('Database is shutting down')
      await first
      await closeDatabase()
      if (driver === 'postgres') {
        expect(doubles.pg).toHaveBeenCalledTimes(1)
        expect(doubles.pg).toHaveBeenCalledExactlyOnceWith('postgresql://localhost/test', {
          schema: expect.anything(),
        })
        expect(doubles.end).toHaveBeenCalledTimes(1)
        expect(doubles.close).not.toHaveBeenCalled()
        expect(doubles.mkdir).not.toHaveBeenCalled()
      } else {
        expect(doubles.createPglite).toHaveBeenCalledExactlyOnceWith('.data/pglite')
        expect(doubles.mkdir).toHaveBeenCalledExactlyOnceWith('.data/pglite', { recursive: true })
        expect(doubles.close).toHaveBeenCalledTimes(1)
        expect(doubles.end).not.toHaveBeenCalled()
      }
    },
  )

  it('creates the configured pglite data directory on demand', async () => {
    configure('pglite', '.data/isolated-suite')
    const { getDatabase } = await import('./client.ts')
    getDatabase()
    expect(doubles.mkdir).toHaveBeenCalledExactlyOnceWith('.data/isolated-suite', {
      recursive: true,
    })
    expect(doubles.createPglite).toHaveBeenCalledExactlyOnceWith('.data/isolated-suite')
  })

  it('does not touch the filesystem for the in-memory pglite database', async () => {
    configure('pglite', 'memory://')
    const { getDatabase } = await import('./client.ts')
    getDatabase()
    expect(doubles.mkdir).not.toHaveBeenCalled()
    expect(doubles.createPglite).toHaveBeenCalledExactlyOnceWith('memory://')
  })

  it.each(['postgres', 'pglite'])(
    'propagates %s close failures without reopening',
    async (driver) => {
      if (driver === 'postgres') configure('postgres', 'postgresql://localhost/test')
      const error = new Error('database close failed')
      const close = driver === 'postgres' ? doubles.end : doubles.close
      close.mockRejectedValue(error)
      const { getDatabase, closeDatabase } = await import('./client.ts')
      getDatabase()
      await expect(closeDatabase()).rejects.toThrow(error)
      await expect(closeDatabase()).rejects.toThrow(error)
      expect(close).toHaveBeenCalledTimes(1)
      expect(() => getDatabase()).toThrow('Database is shutting down')
    },
  )
})
