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
    const category = await service.create({ name: '账号问题' })
    expect(category).toMatchObject({ name: '账号问题', enabled: true, description: null })
  })

  it('rejects a duplicate name', async () => {
    const { service } = setup()
    await service.create({ name: '账号问题' })
    const result = await errorFields(() => service.create({ name: '账号问题' }))
    expect(result).toEqual({ status: 409, code: 'CATEGORY_NAME_TAKEN' })
  })
})

describe('TicketCategoryService.list', () => {
  it('filters by enabled and keyword', async () => {
    const repo = new MemoryTicketCategoryRepository([
      makeTicketCategory({ name: '账号问题', enabled: true }),
      makeTicketCategory({ name: '设备故障', enabled: true }),
      makeTicketCategory({ name: '软件咨询', enabled: false }),
    ])
    const service = createTicketCategoryService({ ticketCategoryRepository: repo })

    const all = await service.list({ page: 1, pageSize: 20 })
    expect(all.total).toBe(3)

    const enabledOnly = await service.list({ page: 1, pageSize: 20, enabled: true })
    expect(enabledOnly.total).toBe(2)

    const keyword = await service.list({ page: 1, pageSize: 20, keyword: '账号' })
    expect(keyword.total).toBe(1)
    expect(keyword.items[0]?.name).toBe('账号问题')
  })
})

describe('TicketCategoryService.get', () => {
  it('returns a category or throws not found', async () => {
    const { service } = setup()
    const created = await service.create({ name: '账号问题' })
    await expect(service.get(created.id)).resolves.toMatchObject({ name: '账号问题' })

    const result = await errorFields(() => service.get('missing'))
    expect(result).toEqual({ status: 404, code: 'CATEGORY_NOT_FOUND' })
  })
})

describe('TicketCategoryService.update', () => {
  it('updates name, description, and enabled', async () => {
    const { service } = setup()
    const created = await service.create({ name: '账号问题' })

    const updated = await service.update(created.id, {
      name: '登录问题',
      description: '登录相关',
      enabled: false,
    })
    expect(updated).toMatchObject({ name: '登录问题', description: '登录相关', enabled: false })
  })

  it('rejects renaming to another category name', async () => {
    const { service } = setup()
    await service.create({ name: '账号问题' })
    const second = await service.create({ name: '设备故障' })

    const result = await errorFields(() => service.update(second.id, { name: '账号问题' }))
    expect(result).toEqual({ status: 409, code: 'CATEGORY_NAME_TAKEN' })
  })

  it('allows keeping the same name (no-op rename)', async () => {
    const { service } = setup()
    const created = await service.create({ name: '账号问题' })
    const updated = await service.update(created.id, { name: '账号问题' })
    expect(updated.name).toBe('账号问题')
  })

  it('throws not found for a missing id', async () => {
    const { service } = setup()
    const result = await errorFields(() => service.update('missing', { enabled: false }))
    expect(result).toEqual({ status: 404, code: 'CATEGORY_NOT_FOUND' })
  })
})
