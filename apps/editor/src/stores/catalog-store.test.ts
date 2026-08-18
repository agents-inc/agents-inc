import { MARKETPLACE_CATALOG, MARKETPLACE_REF } from "@workspace/api-mocks"
import { CATALOG } from "@workspace/matrix"
import { beforeEach, describe, expect, it } from "vitest"

import {
  externalSkillId,
  useCatalogStore,
  type ExternalSkill,
} from "./catalog-store"

// The provider seat. Every consumer in the app reads the catalogue through this
// store rather than importing the vendored module, which is what lets a fetched
// marketplace replace it wholesale — the grid, the stack rail, the roster's
// reach and the pruning of a saved configuration all follow from one swap.
//
// The seat rests on the vendored public catalogue, so an app nobody has pointed
// anywhere behaves exactly as it did before this store existed.

// The prefix is what makes the swap observable rather than a matter of counting:
// CLI-498 gives every custom marketplace's ids its own name as a prefix, and the
// public catalogue's are unprefixed, so no id can be in both.
const ACME_SKILL = "acme-web-widgets"
const PUBLIC_SKILL = "web-framework-react"

beforeEach(() => {
  useCatalogStore.getState().reset()
})

describe("the resting seat", () => {
  it("serves the vendored public catalogue when nobody has named a marketplace", () => {
    const { catalog, marketplace } = useCatalogStore.getState()

    expect(marketplace).toBeNull()
    expect(catalog.skillsById[PUBLIC_SKILL]).toBeDefined()
    expect(catalog.skillCount).toBeGreaterThan(0)
  })

  it("carries the vendored catalogue's stacks and version", () => {
    const { stacks, version } = useCatalogStore.getState()

    expect(stacks.length).toBeGreaterThan(0)
    expect(version).toMatch(/\d/)
  })
})

describe("loading a marketplace", () => {
  beforeEach(() => {
    useCatalogStore.getState().load(MARKETPLACE_CATALOG, MARKETPLACE_REF)
  })

  it("replaces the catalogue wholesale rather than merging into it", () => {
    const { catalog } = useCatalogStore.getState()

    expect(catalog.skillsById[ACME_SKILL]).toBeDefined()
    expect(catalog.skillsById[PUBLIC_SKILL]).toBeUndefined()
    expect(catalog.skillCount).toBe(
      Object.keys(MARKETPLACE_CATALOG.skills).length
    )
  })

  it("records which marketplace is loaded, so a payload can carry it", () => {
    expect(useCatalogStore.getState().marketplace).toBe(MARKETPLACE_REF)
  })

  it("takes the marketplace's version, so a payload stamps what it was built against", () => {
    expect(useCatalogStore.getState().version).toBe(MARKETPLACE_CATALOG.version)
  })

  it("serves the marketplace's own stacks", () => {
    const { stacks } = useCatalogStore.getState()

    expect(stacks.map((stack) => stack.id)).toStrictEqual(["acme-house-stack"])
  })

  // A stack expands into the skills it names, whichever marketplace it is from
  // — the store applies it by exactly this answer.
  it("expands a marketplace stack into its own skills", () => {
    const expansion = useCatalogStore.getState().expandStack("acme-house-stack")

    expect(expansion?.skillIds).toStrictEqual([
      "acme-web-widgets",
      "acme-api-gateway",
    ])
  })

  it("places the marketplace's categories under the domains they name", () => {
    const { catalog } = useCatalogStore.getState()

    expect(catalog.domains.map((domain) => domain.id)).toStrictEqual([
      "web",
      "api",
    ])
  })

  // The open lookup, answered from the seat: an id the loaded catalogue does
  // not carry is `undefined` rather than a throw, exactly as it was vendored.
  it("answers the open lookup from the loaded catalogue", () => {
    const { skillById } = useCatalogStore.getState()

    expect(skillById(ACME_SKILL)?.displayName).toBe("Acme Widgets")
    expect(skillById(PUBLIC_SKILL)).toBeUndefined()
  })

  // Selection semantics are the catalogue's own facts, so a marketplace's
  // conflicts have to be judged by the marketplace's rules and not the public
  // catalogue's — which knows neither id. Asked before the pick-one swap rule,
  // because both fixture skills share an exclusive category and the swap
  // forgives a conflict it resolves: the question here is whether the conflict
  // was READ at all, not what the cell ends up rendering.
  it("judges incompatibility by the loaded catalogue's own relationships", () => {
    const judgement = useCatalogStore.getState().judgeSelection([ACME_SKILL])

    expect(
      judgement.incompatibilityOf("acme-web-legacy-widgets")
    ).toStrictEqual({ kind: "conflict", skillId: ACME_SKILL })
    expect(judgement.reached.has(ACME_SKILL)).toBe(true)
  })

  // The public catalogue's own relationships are gone with it — a selection of
  // ids it has never heard of has nothing to say about them.
  it("knows nothing about the catalogue it replaced", () => {
    const judgement = useCatalogStore.getState().judgeSelection([PUBLIC_SKILL])

    expect(judgement.outOfReach.size).toBe(0)
  })

  it("returns to the public catalogue when it is reset", () => {
    useCatalogStore.getState().reset()
    const { catalog, marketplace } = useCatalogStore.getState()

    expect(marketplace).toBeNull()
    expect(catalog.skillsById[PUBLIC_SKILL]).toBeDefined()
    expect(catalog.skillsById[ACME_SKILL]).toBeUndefined()
  })
})

// ── External skills ──────────────────────────────────────────────────────
//
// An added skill is a REAL CATALOG ENTRY (owner ruling, 2026-08-16), and the
// seat is where that becomes true: the skill is merged into the matrix the
// catalogue is derived from, so it is placed, sorted, judged and looked up by
// exactly the rules every other skill is. Nothing downstream branches on
// provenance, which is what closes the added-skills defect set by construction
// rather than by six patches.

// A category the public catalogue really ships, and the one the user confirmed
// in the dropdown. `web-framework` is exclusive, which is what makes the
// eviction question askable.
const EXCLUSIVE_CATEGORY = CATALOG.skillsById[PUBLIC_SKILL]!.categoryId
const HOUSE_ID = externalSkillId(EXCLUSIVE_CATEGORY, "House React")

const houseSkill = (over: Partial<ExternalSkill> = {}): ExternalSkill => ({
  id: HOUSE_ID,
  displayName: "House React",
  description: "The house React skill.",
  categoryId: EXCLUSIVE_CATEGORY,
  repo: "acme/skills",
  path: "skills/house-react",
  files: { "SKILL.md": "# House React\n" },
  ...over,
})

describe("externalSkillId", () => {
  // Journey 26: a skill answering to no marketplace takes the `external-`
  // namespace, and CLI-425's invariant puts its category in the id too. The
  // separator is `-` and nothing else, because the id is a directory name and
  // has to be legal on Windows.
  it("namespaces under external- and carries the category", () => {
    expect(externalSkillId("web-framework", "House React")).toBe(
      "external-web-framework-house-react"
    )
  })

  it("holds nothing a filesystem refuses", () => {
    const id = externalSkillId("web-tooling", "docx/Word Docs (v2)")

    expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  // Two people's `docx` in one category is one id, which is the collision the
  // intake has to see. Deriving a longer id from the owner would hide it — and
  // these are eject-only per-install files, so the requirement is uniqueness
  // within one machine rather than across GitHub.
  it("gives two skills of one name in one category the same id", () => {
    expect(externalSkillId("web-tooling", "docx")).toBe(
      externalSkillId("web-tooling", "docx")
    )
  })
})

describe("adding an external skill", () => {
  beforeEach(() => {
    useCatalogStore.getState().addExternal([houseSkill()])
  })

  it("answers the open lookup, exactly as a catalogue skill does", () => {
    expect(useCatalogStore.getState().skillById(HOUSE_ID)?.displayName).toBe(
      "House React"
    )
  })

  it("joins the index every consumer prunes against", () => {
    expect(
      useCatalogStore.getState().catalog.skillsById[HOUSE_ID]
    ).toBeDefined()
  })

  // Placed by `buildCatalog` rather than spliced in beside it, so an external
  // skill lands in its category under its domain in one derivation — no second
  // placement path, and no orphan section for a filter to erase.
  it("renders inside the category it was given, under that category's domain", () => {
    const { catalog } = useCatalogStore.getState()
    const category = catalog.categoriesById[EXCLUSIVE_CATEGORY]!

    expect(category.skills.map((skill) => skill.id)).toContain(HOUSE_ID)
    expect(catalog.skillsById[HOUSE_ID]?.domainId).toBe(category.domainId)
  })

  it("counts towards the catalogue it joined", () => {
    expect(useCatalogStore.getState().catalog.skillCount).toBe(
      CATALOG.skillCount + 1
    )
  })

  // It declares no relationships and is declared by none, so it neither rules
  // anything out nor is ruled out — but the semantics have to have SEEN it, or
  // a category's pick-one rule cannot reach it.
  it("is judged by the same semantics as the rest of the catalogue", () => {
    const judgement = useCatalogStore.getState().judgeSelection([HOUSE_ID])

    expect(judgement.reached.has(HOUSE_ID)).toBe(true)
  })

  it("keeps the content, so the payload can carry it", () => {
    expect(useCatalogStore.getState().external[HOUSE_ID]?.files).toStrictEqual({
      "SKILL.md": "# House React\n",
    })
  })

  it("is idempotent, so a re-imported payload adds nothing twice", () => {
    useCatalogStore.getState().addExternal([houseSkill()])

    expect(useCatalogStore.getState().catalog.skillCount).toBe(
      CATALOG.skillCount + 1
    )
  })

  it("leaves the catalogue as it was when it is removed", () => {
    useCatalogStore.getState().removeExternal(HOUSE_ID)
    const { catalog, external } = useCatalogStore.getState()

    expect(catalog.skillsById[HOUSE_ID]).toBeUndefined()
    expect(catalog.skillCount).toBe(CATALOG.skillCount)
    expect(external[HOUSE_ID]).toBeUndefined()
  })

  // A category id belongs to the catalogue that declared it, so a skill filed
  // under one marketplace's taxonomy has no place in another's. Dropped WITH
  // the catalogue rather than left to be placed by a category that happens to
  // share a name — the same wholesale rule the swap already follows.
  it("goes with the catalogue when a marketplace is loaded", () => {
    useCatalogStore.getState().load(MARKETPLACE_CATALOG, MARKETPLACE_REF)

    expect(useCatalogStore.getState().external[HOUSE_ID]).toBeUndefined()
    expect(
      useCatalogStore.getState().catalog.skillsById[HOUSE_ID]
    ).toBeUndefined()
  })

  it("goes when the seat is reset", () => {
    useCatalogStore.getState().reset()

    expect(useCatalogStore.getState().external).toStrictEqual({})
  })
})
