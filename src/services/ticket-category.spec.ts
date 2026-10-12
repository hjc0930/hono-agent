import { describe, expect, it } from 'vitest'

import { MemoryTicketCategoryRepository, makeTicketCategory } from '../repositories/fakes.ts'
import { createTicketCategoryService } from './ticket-category.ts'

const setup = () => {
  const ticketCategoryRepository = new MemoryTicketCategoryRepository()
  const service = createTicketCategoryService({ ticketCategoryRepository })
  return { service, ticketCategoryRepository }
}

const errorFields = async (run: () => Promise<unknown>) => {
  try {
    await run()
    throw new Error('expected the call to throw')
  } catch (error) {
    const appError = error as { status?: number; code?: string }
    return { status: appError.status, code: appError.code }
  }
}

describe('TicketCategoryService.create', () => {
  it('creates an enabled category', async () => {
    const { service } = setup()
    const category = await service.create({ name: 'Account Issues' })
    expect(category).toMatchObject({ name: 'Account Issues', enabled: true, description: null })
  })

  it('rejects a duplicate name', async () => {
    const { service } = setup()
    await service.create({ name: 'Account Issues' })
    const result = await errorFields(() => service.create({ name: 'Account Issues' }))
    expect(result).toEqual({ status: 409, code: 'CATEGORY_NAME_TAKEN' })
  })
})

describe('TicketCategoryService.list', () => {
  it('filters by enabled and keyword', async () => {
    const repo = new MemoryTicketCategoryRepository([
      makeTicketCategory({ name: 'Account Issues', enabled: true }),
      makeTicketCategory({ name: 'Hardware Failures', enabled: true }),
      makeTicketCategory({ name: 'Software Questions', enabled: false }),
    ])
    const service = createTicketCategoryService({ ticketCategoryRepository: repo })

    const all = await service.list({ page: 1, pageSize: 20 })
    expect(all.total).toBe(3)

    const enabledOnly = await service.list({ page: 1, pageSize: 20, enabled: true })
    expect(enabledOnly.total).toBe(2)

    const keyword = await service.list({ page: 1, pageSize: 20, keyword: 'Account' })
    expect(keyword.total).toBe(1)
    expect(keyword.items[0]?.name).toBe('Account Issues')
  })
})

describe('TicketCategoryService.get', () => {
  it('returns a category or throws not found', async () => {
    const { service } = setup()
    const created = await service.create({ name: 'Account Issues' })
    await expect(service.get(created.id)).resolves.toMatchObject({ name: 'Account Issues' })

    const result = await errorFields(() => service.get('missing'))
    expect(result).toEqual({ status: 404, code: 'CATEGORY_NOT_FOUND' })
  })
})

describe('TicketCategoryService.update', () => {
  it('updates name, description, and enabled', async () => {
    const { service } = setup()
    const created = await service.create({ name: 'Account Issues' })

    const updated = await service.update(created.id, {
      name: 'Login Issues',
      description: 'Login-related issues',
      enabled: false,
    })
    expect(updated).toMatchObject({
      name: 'Login Issues',
      description: 'Login-related issues',
      enabled: false,
    })
  })

  it('rejects renaming to another category name', async () => {
    const { service } = setup()
    await service.create({ name: 'Account Issues' })
    const second = await service.create({ name: 'Hardware Failures' })

    const result = await errorFields(() => service.update(second.id, { name: 'Account Issues' }))
    expect(result).toEqual({ status: 409, code: 'CATEGORY_NAME_TAKEN' })
  })

  it('allows keeping the same name (no-op rename)', async () => {
    const { service } = setup()
    const created = await service.create({ name: 'Account Issues' })
    const updated = await service.update(created.id, { name: 'Account Issues' })
    expect(updated.name).toBe('Account Issues')
  })

  it('throws not found for a missing id', async () => {
    const { service } = setup()
    const result = await errorFields(() => service.update('missing', { enabled: false }))
    expect(result).toEqual({ status: 404, code: 'CATEGORY_NOT_FOUND' })
  })
})
