import { MARKETPLACE_CATALOG, MARKETPLACE_REF } from "@workspace/api-mocks"
import { CATALOG } from "@workspace/matrix"
import { beforeEach, describe, expect, it } from "vitest"

import {
  externalSkillId,
  useCatalogStore,
  type ExternalSkill,
} from "./catalog-store"

// Custom marketplace ids are prefixed and public ones are not, so no id is in
// both.
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

  it("answers the open lookup from the loaded catalogue", () => {
    const { skillById } = useCatalogStore.getState()

    expect(skillById(ACME_SKILL)?.displayName).toBe("Acme Widgets")
    expect(skillById(PUBLIC_SKILL)).toBeUndefined()
  })

  // Asked before the pick-one swap, which would forgive a conflict it resolves.
  it("judges incompatibility by the loaded catalogue's own relationships", () => {
    const judgement = useCatalogStore.getState().judgeSelection([ACME_SKILL])

    expect(
      judgement.incompatibilityOf("acme-web-legacy-widgets")
    ).toStrictEqual({ kind: "conflict", skillId: ACME_SKILL })
    expect(judgement.reached.has(ACME_SKILL)).toBe(true)
  })

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

// `web-framework` is exclusive, which makes the eviction question askable.
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
  it("namespaces under external- and carries the category", () => {
    expect(externalSkillId("web-framework", "House React")).toBe(
      "external-web-framework-house-react"
    )
  })

  it("holds nothing a filesystem refuses", () => {
    const id = externalSkillId("web-tooling", "docx/Word Docs (v2)")

    expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  // Eject-only per-install files: uniqueness is per machine, not across GitHub.
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

describe("externalSkillId on a name with runs of punctuation", () => {
  it("folds each run into one separator", () => {
    expect(externalSkillId("web-tooling", "docx  //  Word Docs")).toBe(
      "external-web-tooling-docx-word-docs"
    )
  })
})

// The seat is replaced only when something changes, so nothing re-renders for
// a no-op.
describe("adding and removing what the seat already reflects", () => {
  beforeEach(() => {
    useCatalogStore.getState().addExternal([houseSkill()])
  })

  it("keeps the first copy of a skill added again under the same id", () => {
    useCatalogStore
      .getState()
      .addExternal([houseSkill({ description: "A later copy." })])

    expect(useCatalogStore.getState().external[HOUSE_ID]?.description).toBe(
      "The house React skill."
    )
  })

  it("leaves the seat untouched when every skill added is already held", () => {
    const before = useCatalogStore.getState()

    before.addExternal([houseSkill()])

    expect(useCatalogStore.getState()).toBe(before)
  })

  it("leaves the seat untouched when the skill removed is not held", () => {
    const before = useCatalogStore.getState()

    before.removeExternal(externalSkillId(EXCLUSIVE_CATEGORY, "Nobody's"))

    expect(useCatalogStore.getState()).toBe(before)
  })
})
