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

// The provider seat: the one place the app reads a catalogue from.
//
// It exists because the alternative was fifteen modules importing the vendored
// matrix directly, which made "run on a different catalogue" a fifteen-file
// change rather than a value swap. Everything derived from a catalogue lives
// here — the grid's domains, the stack rail's cells, the open skill lookup, the
// stack expander, the selection semantics and the version a payload is stamped
// with — because they must all move together or not at all. A grid showing one
// marketplace's skills while the semantics judge them by another's is not a
// state worth being able to represent.
//
// It rests on the vendored public catalogue, so an app nobody has pointed
// anywhere behaves exactly as it did before this store existed.
//
// Zustand rather than React context, matching every other cross-cutting piece
// of state here: components subscribe with a selector and re-render on a swap,
// while the stores and pure derivations that are not components read the same
// values through `getState()` — the arrangement `config-store` already uses for
// `useUiStore`.

/**
 * A skill added from outside whichever catalogue is loaded.
 *
 * It lives HERE rather than in a store of its own, and that is the EDITOR-03
 * ruling made structural: an added skill is a real catalogue entry (owner,
 * 2026-08-16), so it is merged into the matrix the read models are built from
 * and placed, sorted, judged and looked up by exactly the rules every other
 * skill is. Nothing downstream branches on provenance, which is what closed
 * EDITOR-15 to EDITOR-20 by construction rather than with six patches.
 *
 * `files` is the whole directory, resolved at add time. It is what makes a
 * shared id self-contained: the payload carries the bytes, so no consumer has
 * to reach a third-party repository to install what the link names.
 */
export type ExternalSkill = {
  id: string
  displayName: string
  description: string
  /** A category of the loaded catalogue — the placement the user confirmed. */
  categoryId: string
  /** GitHub's own `owner/name`, kept as provenance rather than as a lookup. */
  repo: string
  /** The skill's DIRECTORY within that repo — `skills/docx`, never SKILL.md. */
  path: string
  files: SeedSkillTree
}

// Everything one catalogue implies. Together in one type because they must move
// together: a grid showing one marketplace's skills while the semantics judge
// them by another's is not a state worth being able to represent.
type CatalogSeat = {
  /** The whole grid: domains, their categories, and both indexes. */
  catalog: Catalog
  /**
   * The wire catalogue the read models above were built from, external skills
   * merged in — the shape `@workspace/compile` renders against.
   *
   * Held beside the built `Catalog` rather than derived again by whoever wants
   * it: `seatFor` already computes it, and the output preview hands it to every
   * renderer AND seats it on the compile package's own catalogue, so a second
   * derivation is a second answer to "which catalogue is this drawn against".
   */
  matrix: Matrix
  /** The stack rail's cells, this catalogue's own. */
  stacks: CatalogStack[]
  /** Stamped into every payload, so a receiver can explain skipped ids. */
  version: string
  /** The ref this came from; `null` is the vendored public catalogue. */
  marketplace: string | null
  /** The open lookup — an id this catalogue does not carry is `undefined`. */
  skillById: (skillId: string) => CatalogSkill | undefined
  expandStack: (stackId: string) => StackExpansion | undefined
  judgeSelection: SelectionSemantics
  /**
   * The skills above that answer to no marketplace, by id.
   *
   * They are in `catalog` like everything else; this is the second thing the
   * seat knows about them — where they came from and what they hold — which
   * `Catalog` has no field for and no reason to.
   */
  external: Record<string, ExternalSkill>
}

// What a seat is derived FROM, kept so a skill added later can be merged into
// it and the whole thing rebuilt. Holding the built `Catalog` alone would leave
// no way to add an entry except splicing one in beside `buildCatalog` — a
// second placement path, which is the shape this store exists to avoid.
type CatalogSource = { matrix: Matrix; marketplace: string | null }

type CatalogState = CatalogSeat & {
  // A parsed catalogue and where it came from. Wholesale — never merged into
  // what is there: two marketplaces' ids cannot collide by construction
  // (CLI-498), so a merge would have no conflicts to resolve and would still be
  // a catalogue nobody published. External skills go with it for the same
  // reason: a category id belongs to the catalogue that declared it, so a skill
  // filed under one taxonomy has no place in another's.
  load: (matrix: Matrix, marketplace: string) => void
  // Back to the vendored public catalogue, external skills included.
  reset: () => void
  // Idempotent: an id already seated is left as it is, so re-importing a
  // payload that carries a skill this browser already added adds nothing twice.
  addExternal: (skills: ExternalSkill[]) => void
  removeExternal: (skillId: string) => void
}

const PUBLIC_SOURCE: CatalogSource = { matrix: MATRIX, marketplace: null }

// The vendored seat, built from the module-level singletons rather than by
// re-deriving them: `@workspace/matrix` already did this work at import, and
// doing it twice would double the app's slowest startup step for nothing. It is
// exactly `seatFor(PUBLIC_SOURCE, {})` and is only reached before anybody has
// added a skill — which is every session that never opens the add dialog.
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

// An external skill in the wire shape a catalogue is built from. It declares no
// relationships and is named by none, which is honest: nothing outside the
// catalogue can say what it conflicts with, and nothing inside knows it exists.
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

// A catalogue and its external skills, derived in one place from one parse
// rather than assembled from wherever each piece happened to be available.
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

// `-`, and nothing else. The id is a directory name once the CLI ejects it, so
// it has to be legal on Windows — which rules out the `:` and `/` a repository
// coordinate is spelled with.
const SEPARATOR = "-"

// Journey 26's namespace for a skill that answers to no marketplace, plus
// CLI-425's invariant that an id carries its category. `external`, `agents-inc`
// and `local` are reserved marketplace names, so nothing published can collide
// with this by construction.
const EXTERNAL_NAMESPACE = "external"

const kebab = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, SEPARATOR)
    .replace(/^-+|-+$/g, "")

/**
 * The id an added skill answers to, minted once at intake.
 *
 * It does NOT make two external skills unique against each other — it separates
 * them from marketplaces, not from one another — and that is deliberate. These
 * are eject-only per-install files, so the requirement is uniqueness within one
 * machine's two scopes rather than across GitHub; two skills of one name in one
 * category really is one id, and the intake refuses the second naming what
 * already holds it (Journey 26).
 */
export const externalSkillId = (categoryId: string, name: string) =>
  [EXTERNAL_NAMESPACE, kebab(categoryId), kebab(name)].join(SEPARATOR)

const withoutKey = <T>(record: Record<string, T>, key: string) => {
  const { [key]: _removed, ...rest } = record
  return rest
}

export const useCatalogStore = create<CatalogState>()((set, get) => {
  // Where the seat came from, so adding a skill can rebuild rather than splice.
  // Held outside the state because nothing renders it and every read of it is
  // immediately followed by a `set`.
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

// The non-React readers. Every store and pure derivation in the app goes
// through these rather than importing the vendored module, which is what makes
// the seat a seat: a swap reaches them without any of them knowing it happened.
//
// All named `active*` — the catalogue currently seated, whichever it is. Read
// per call rather than destructured once at module scope: a binding taken at
// import would be the vendored catalogue forever, which is the exact bug this
// store exists to make unrepresentable.
export const activeCatalog = () => useCatalogStore.getState().catalog

/** The wire catalogue, for the renderers that take one as a parameter. */
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
