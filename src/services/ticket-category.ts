import { categoryNameTakenError, categoryNotFoundError } from '../lib/errors.ts'
import type {
  TicketCategoryListFilter,
  TicketCategoryPatch,
  TicketCategoryRecord,
  TicketCategoryRepository,
} from '../repositories/ticket-category-repository.ts'

export type PublicCategory = {
  id: string
  name: string
  description: string | null
  enabled: boolean
}

const toPublicCategory = (category: TicketCategoryRecord): PublicCategory => ({
  id: category.id,
  name: category.name,
  description: category.description,
  enabled: category.enabled,
})

export type TicketCategoryService = {
  create(input: { name: string; description?: string | null }): Promise<PublicCategory>
  list(filter: TicketCategoryListFilter): Promise<{ items: PublicCategory[]; total: number }>
  get(id: string): Promise<PublicCategory>
  update(id: string, patch: TicketCategoryPatch): Promise<PublicCategory>
}

export const createTicketCategoryService = (dependencies: {
  ticketCategoryRepository: TicketCategoryRepository
}): TicketCategoryService => {
  const { ticketCategoryRepository } = dependencies

  return {
    async create(input) {
      const existing = await ticketCategoryRepository.findByName(input.name)
      if (existing) throw categoryNameTakenError()

      const created = await ticketCategoryRepository.insert({
        name: input.name,
        description: input.description ?? null,
        enabled: true,
      })
      return toPublicCategory(created)
    },

    async list(filter) {
      const { items, total } = await ticketCategoryRepository.list(filter)
      return { items: items.map(toPublicCategory), total }
    },

    async get(id) {
      const category = await ticketCategoryRepository.findById(id)
      if (!category) throw categoryNotFoundError()
      return toPublicCategory(category)
    },

    async update(id, patch) {
      if (patch.name !== undefined) {
        const existing = await ticketCategoryRepository.findByName(patch.name)
        if (existing && existing.id !== id) throw categoryNameTakenError()
      }

      const updated = await ticketCategoryRepository.update(id, patch)
      if (!updated) throw categoryNotFoundError()
      return toPublicCategory(updated)
    },
  }
}
