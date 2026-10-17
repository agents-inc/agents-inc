import {
  CATALOG,
  MATRIX,
  MATRIX_VERSION,
  STACKS,
  buildCatalog,
  buildStacks,
  catalogFactsOf,
  createSelectionSemantics,
  createSkillLookup,
  createStackExpander,
  expandStack,
  judgeSelection,
  skillById,
  type Catalog,
  type CatalogSkill,
  type CatalogStack,
  type Matrix,
  type MatrixSkill,
  type SeedSkillTree,
  type SelectionSemantics,
  type StackExpansion,
} from "@workspace/matrix"
import { create } from "zustand"

// The one place the app reads a catalogue from. Everything derived from it
// lives here so it all moves together on a swap.

/**
 * A skill added from outside the loaded catalogue, merged in as a real
 * catalogue entry. `files` holds the whole directory, so a shared id is
 * self-contained.
 */
export type ExternalSkill = {
  id: string
  displayName: string
  description: string
  categoryId: string
  /** Provenance only, never a lookup. */
  repo: string
  /** The skill's directory in the repo, never SKILL.md. */
  path: string
  files: SeedSkillTree
}

type CatalogSeat = {
  catalog: Catalog
  /**
   * The wire catalogue `@workspace/compile` renders against, external skills
   * merged in.
   */
  matrix: Matrix
  stacks: CatalogStack[]
  /** Stamped into every payload, so a receiver can explain skipped ids. */
  version: string
  /** The ref this came from; `null` is the vendored public catalogue. */
  marketplace: string | null
  /** The open lookup — an id this catalogue does not carry is `undefined`. */
  skillById: (skillId: string) => CatalogSkill | undefined
  expandStack: (stackId: string) => StackExpansion | undefined
  judgeSelection: SelectionSemantics
  /** Provenance and contents of the added skills in `catalog`. */
  external: Record<string, ExternalSkill>
}

// Kept so an added skill can be merged in and the seat rebuilt.
type CatalogSource = { matrix: Matrix; marketplace: string | null }

type CatalogState = CatalogSeat & {
  // Replaces the seat wholesale, external skills included.
  load: (matrix: Matrix, marketplace: string) => void
  // Back to the vendored public catalogue, external skills included.
  reset: () => void
  // Idempotent: an id already seated is left as it is.
  addExternal: (skills: ExternalSkill[]) => void
  removeExternal: (skillId: string) => void
}

const PUBLIC_SOURCE: CatalogSource = { matrix: MATRIX, marketplace: null }

// Reuses `@workspace/matrix`'s import-time build; equal to
// `seatFor(PUBLIC_SOURCE, {})`.
const PUBLIC_SEAT: CatalogSeat = {
  catalog: CATALOG,
  matrix: MATRIX,
  stacks: STACKS,
  version: MATRIX_VERSION,
  marketplace: null,
  skillById,
  expandStack,
  judgeSelection,
  external: {},
}

// No relationships: nothing outside the catalogue can say what it conflicts
// with.
const toMatrixSkill = (skill: ExternalSkill): MatrixSkill => ({
  id: skill.id,
  slug: skill.id,
  displayName: skill.displayName,
  description: skill.description,
  category: skill.categoryId,
  conflictsWith: [],
  discourages: [],
  requires: [],
})

const matrixWith = (
  matrix: Matrix,
  external: Record<string, ExternalSkill>
): Matrix => ({
  ...matrix,
  skills: {
    ...matrix.skills,
    ...Object.fromEntries(
      Object.values(external).map((skill) => [skill.id, toMatrixSkill(skill)])
    ),
  },
})

const seatFor = (
  { matrix, marketplace }: CatalogSource,
  external: Record<string, ExternalSkill>
): CatalogSeat => {
  const merged = matrixWith(matrix, external)
  const catalog = buildCatalog(merged)

  return {
    catalog,
    matrix: merged,
    stacks: buildStacks(merged),
    version: matrix.version,
    marketplace,
    skillById: createSkillLookup(catalog),
    expandStack: createStackExpander(merged),
    judgeSelection: createSelectionSemantics(catalogFactsOf(merged)),
    external,
  }
}

// The id becomes a directory name, so no `:` or `/` (Windows).
const SEPARATOR = "-"

// `external` is a reserved marketplace name, so nothing published can collide.
const EXTERNAL_NAMESPACE = "external"

const kebab = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, SEPARATOR)
    .replace(/^-+|-+$/g, "")

/**
 * Unique against marketplaces, not against each other: same category and name
 * is one id.
 */
export const externalSkillId = (categoryId: string, name: string) =>
  [EXTERNAL_NAMESPACE, kebab(categoryId), kebab(name)].join(SEPARATOR)

const withoutKey = <T>(record: Record<string, T>, key: string) => {
  const { [key]: _removed, ...rest } = record
  return rest
}

export const useCatalogStore = create<CatalogState>()((set, get) => {
  // Outside the state: nothing renders it.
  let source: CatalogSource = PUBLIC_SOURCE

  const reseat = (external: Record<string, ExternalSkill>) =>
    set(seatFor(source, external))

  return {
    ...PUBLIC_SEAT,

    load: (matrix, marketplace) => {
      source = { matrix, marketplace }
      reseat({})
    },

    reset: () => {
      source = PUBLIC_SOURCE
      set(PUBLIC_SEAT)
    },

    addExternal: (skills) => {
      const held = get().external
      const fresh = skills.filter((skill) => !(skill.id in held))
      if (fresh.length === 0) return

      reseat({
        ...held,
        ...Object.fromEntries(fresh.map((skill) => [skill.id, skill])),
      })
    },

    removeExternal: (skillId) => {
      if (!(skillId in get().external)) return
      reseat(withoutKey(get().external, skillId))
    },
  }
})

// Non-React readers. Read per call: a binding taken at import would pin the
// vendored catalogue.
export const activeCatalog = () => useCatalogStore.getState().catalog

export const activeMatrix = () => useCatalogStore.getState().matrix
export const activeStacks = () => useCatalogStore.getState().stacks
export const activeVersion = () => useCatalogStore.getState().version
export const activeMarketplace = () => useCatalogStore.getState().marketplace

export const activeSkillById = (skillId: string) =>
  useCatalogStore.getState().skillById(skillId)

/** The provenance half: `undefined` for every skill the catalogue shipped. */
export const activeExternalSkill = (skillId: string) =>
  useCatalogStore.getState().external[skillId]

export const expandActiveStack = (stackId: string) =>
  useCatalogStore.getState().expandStack(stackId)

export const judgeActiveSelection: SelectionSemantics = (selectedIds) =>
  useCatalogStore.getState().judgeSelection(selectedIds)
