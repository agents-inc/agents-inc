import { CATALOG, type Category, type Domain } from "@workspace/matrix"
import { create } from "zustand"

// A skill pulled in from GitHub during this session.
//
// Deliberately **not persisted**. A reload drops it, and `config-store`'s
// `partialize` strips any selection that referenced it, so nothing survives
// into localStorage that the next session could not describe or install.
// Persisting these means giving them a real catalog entry, which is a
// marketplace concern rather than a UI one.
export type AddedSkill = {
  id: string
  displayName: string
  description: string
  // Two letters for the cell's 26px logo slot.
  monogram: string
  // `owner/name`, kept for the install inventory.
  repo: string
  // Resolved from the catalog; `null` renders under Uncategorized.
  categoryId: Category | null
  domainId: Domain | null
}

type AddedSkillsState = {
  added: AddedSkill[]
  add: (skills: AddedSkill[]) => void
  remove: (id: string) => void
  isAdded: (id: string) => boolean
}

export const addedSkillId = (repo: string) => `github:${repo}`

// `software-mansion/react-native-reanimated` → `RN`, `framer/motion` → `MO`.
export const monogramFor = (name: string) => {
  const words = name.split(/[-_./\s]+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase()
  }
  return (words[0] ?? name).slice(0, 2).toUpperCase()
}

// The design's "category comes from the marketplace index" rule. Our index is
// the generated catalog, so a repo matches when its name equals a known skill
// slug. Anything else is Uncategorized — the user cannot override it.
export const categoriseRepo = (repo: string) => {
  const name = repo.split("/").pop()?.toLowerCase() ?? ""
  const normalised = name.replace(/[^a-z0-9]/g, "")

  const match = Object.values(CATALOG.skillsById).find((skill) => {
    const slug = skill.slug.toLowerCase()
    return slug === name || slug.replace(/[^a-z0-9]/g, "") === normalised
  })

  return match
    ? { categoryId: match.categoryId, domainId: match.domainId }
    : { categoryId: null, domainId: null }
}

export const useAddedSkillsStore = create<AddedSkillsState>()((set, get) => ({
  added: [],

  add: (skills) =>
    set((state) => {
      const known = new Set(state.added.map((skill) => skill.id))
      const fresh = skills.filter((skill) => !known.has(skill.id))
      return fresh.length ? { added: [...state.added, ...fresh] } : {}
    }),

  remove: (id) =>
    set((state) => ({
      added: state.added.filter((skill) => skill.id !== id),
    })),

  isAdded: (id) => get().added.some((skill) => skill.id === id),
}))
