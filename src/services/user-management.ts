import { hashPassword } from '../lib/password.ts'
import {
  selfModificationForbiddenError,
  userNotFoundError,
  usernameTakenError,
} from '../lib/errors.ts'
import type {
  UserListFilter,
  UserPatch,
  UserRecord,
  UserRepository,
} from '../repositories/user-repository.ts'
import type { PublicUser } from './auth.ts'

const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  status: user.status,
})

export type CreateUserInput = {
  username: string
  password: string
  displayName?: string | null
  role: UserRecord['role']
}

export type UserManagementService = {
  createUser(input: CreateUserInput): Promise<PublicUser>
  listUsers(filter: UserListFilter): Promise<{ items: PublicUser[]; total: number }>
  getUser(id: string): Promise<PublicUser>
  updateUser(id: string, actorId: string, patch: UserPatch): Promise<PublicUser>
  resetPassword(id: string, password: string): Promise<void>
}

export const createUserManagementService = (dependencies: {
  userRepository: UserRepository
}): UserManagementService => {
  const { userRepository } = dependencies

  return {
    async createUser(input) {
      const existing = await userRepository.findByUsername(input.username)
      if (existing) throw usernameTakenError()

      const created = await userRepository.insert({
        username: input.username,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName ?? null,
        role: input.role,
        status: 'active',
      })
      return toPublicUser(created)
    },

    async listUsers(filter) {
      const { items, total } = await userRepository.list(filter)
      return { items: items.map(toPublicUser), total }
    },

    async getUser(id) {
      const user = await userRepository.findById(id)
      if (!user) throw userNotFoundError()
      return toPublicUser(user)
    },

    async updateUser(id, actorId, patch) {
      const user = await userRepository.findById(id)
      if (!user) throw userNotFoundError()

      // Self-protection: an admin cannot disable or demote themselves, which would
      // risk leaving the system with no enabled admin.
      if (id === actorId && (patch.status === 'disabled' || patch.role !== undefined)) {
        throw selfModificationForbiddenError()
      }

      const updated = await userRepository.update(id, patch)
      if (!updated) throw userNotFoundError()
      return toPublicUser(updated)
    },

    async resetPassword(id, password) {
      const user = await userRepository.findById(id)
      if (!user) throw userNotFoundError()
      await userRepository.update(id, { passwordHash: await hashPassword(password) })
    },
  }
}
