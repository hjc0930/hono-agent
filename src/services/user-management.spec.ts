import { describe, expect, it } from 'vitest'

import { verifyPassword } from '../lib/password.ts'
import { MemoryUserRepository, makeUser } from '../repositories/fakes.ts'
import { createUserManagementService } from './user-management.ts'

const PASSWORD = 'initial-password-1'

const setup = () => {
  const userRepository = new MemoryUserRepository()
  const service = createUserManagementService({ userRepository })
  return { service, userRepository }
}

const errorFields = async (run: () => Promise<unknown>) => {
  try {
    await run()
    throw new Error('expected the call to throw')
  } catch (error) {
    const appError = error as { status?: number; code?: string; message?: string }
    return { status: appError.status, code: appError.code, message: appError.message }
  }
}

describe('UserManagementService.createUser', () => {
  it('creates an active user with a hashed password', async () => {
    const { service, userRepository } = setup()

    const user = await service.createUser({
      username: 'bob',
      password: PASSWORD,
      role: 'agent',
    })

    expect(user).toMatchObject({ username: 'bob', role: 'agent', status: 'active' })
    const stored = await userRepository.findByUsername('bob')
    expect(stored).not.toBeNull()
    expect(stored!.passwordHash).not.toBe(PASSWORD)
    await expect(verifyPassword(PASSWORD, stored!.passwordHash)).resolves.toBe(true)
  })

  it('defaults role to user and displayName to null', async () => {
    const { service } = setup()
    const user = await service.createUser({ username: 'carol', password: PASSWORD, role: 'user' })
    expect(user.displayName).toBeNull()
  })

  it('rejects a taken username with USERNAME_TAKEN', async () => {
    const { service } = setup()
    await service.createUser({ username: 'bob', password: PASSWORD, role: 'user' })

    const result = await errorFields(() =>
      service.createUser({ username: 'bob', password: 'another-password', role: 'user' }),
    )
    expect(result).toEqual({
      status: 409,
      code: 'USERNAME_TAKEN',
      message: 'Username is already taken',
    })
  })
})

describe('UserManagementService.listUsers', () => {
  it('returns public users without password hashes', async () => {
    const userRepository = new MemoryUserRepository([
      makeUser({ username: 'alice', role: 'admin' }),
      makeUser({ username: 'bob', role: 'user' }),
    ])
    const service = createUserManagementService({ userRepository })

    const { items, total } = await service.listUsers({ page: 1, pageSize: 20 })

    expect(total).toBe(2)
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item).not.toHaveProperty('passwordHash')
    }
  })

  it('filters by role and keyword', async () => {
    const userRepository = new MemoryUserRepository([
      makeUser({ username: 'alice', role: 'admin', displayName: 'Alice Admin' }),
      makeUser({ username: 'bob', role: 'user' }),
      makeUser({ username: 'carol', role: 'user', displayName: 'Carol User' }),
    ])
    const service = createUserManagementService({ userRepository })

    const byRole = await service.listUsers({ page: 1, pageSize: 20, role: 'user' })
    expect(byRole.total).toBe(2)

    const byKeyword = await service.listUsers({ page: 1, pageSize: 20, keyword: 'alice' })
    expect(byKeyword.total).toBe(1)
    expect(byKeyword.items[0]?.username).toBe('alice')
  })
})

describe('UserManagementService.getUser', () => {
  it('returns a user by id', async () => {
    const { service } = setup()
    const created = await service.createUser({ username: 'bob', password: PASSWORD, role: 'user' })
    await expect(service.getUser(created.id)).resolves.toMatchObject({ username: 'bob' })
  })

  it('throws USER_NOT_FOUND for a missing id', async () => {
    const { service } = setup()
    const result = await errorFields(() => service.getUser('missing-id'))
    expect(result).toEqual({ status: 404, code: 'USER_NOT_FOUND', message: 'User not found' })
  })
})

describe('UserManagementService.updateUser', () => {
  it('updates role, status, and displayName', async () => {
    const { service } = setup()
    const created = await service.createUser({ username: 'bob', password: PASSWORD, role: 'user' })

    const updated = await service.updateUser(created.id, 'actor-admin', {
      role: 'agent',
      status: 'disabled',
      displayName: 'Bob Agent',
    })

    expect(updated).toMatchObject({ role: 'agent', status: 'disabled', displayName: 'Bob Agent' })
  })

  it('forbids disabling oneself', async () => {
    const { service } = setup()
    const admin = await service.createUser({ username: 'admin', password: PASSWORD, role: 'admin' })

    const result = await errorFields(() =>
      service.updateUser(admin.id, admin.id, { status: 'disabled' }),
    )
    expect(result).toEqual({
      status: 403,
      code: 'SELF_MODIFICATION_FORBIDDEN',
      message: 'Cannot modify your own role or status',
    })
  })

  it('forbids changing ones own role', async () => {
    const { service } = setup()
    const admin = await service.createUser({ username: 'admin', password: PASSWORD, role: 'admin' })

    const result = await errorFields(() => service.updateUser(admin.id, admin.id, { role: 'user' }))
    expect(result.code).toBe('SELF_MODIFICATION_FORBIDDEN')
  })

  it('allows changing ones own displayName (non-destructive)', async () => {
    const { service } = setup()
    const admin = await service.createUser({ username: 'admin', password: PASSWORD, role: 'admin' })

    const updated = await service.updateUser(admin.id, admin.id, { displayName: 'Renamed' })
    expect(updated.displayName).toBe('Renamed')
  })

  it('throws USER_NOT_FOUND for a missing id', async () => {
    const { service } = setup()
    const result = await errorFields(() =>
      service.updateUser('missing-id', 'actor-admin', { role: 'agent' }),
    )
    expect(result.code).toBe('USER_NOT_FOUND')
  })
})

describe('UserManagementService.resetPassword', () => {
  it('replaces the password hash so the new password verifies', async () => {
    const { service, userRepository } = setup()
    const created = await service.createUser({
      username: 'bob',
      password: 'old-password-1',
      role: 'user',
    })

    await service.resetPassword(created.id, 'new-password-2')

    const stored = await userRepository.findById(created.id)
    expect(stored).not.toBeNull()
    await expect(verifyPassword('new-password-2', stored!.passwordHash)).resolves.toBe(true)
    await expect(verifyPassword('old-password-1', stored!.passwordHash)).resolves.toBe(false)
  })

  it('throws USER_NOT_FOUND for a missing id', async () => {
    const { service } = setup()
    const result = await errorFields(() => service.resetPassword('missing-id', 'new-password-2'))
    expect(result.code).toBe('USER_NOT_FOUND')
  })
})
