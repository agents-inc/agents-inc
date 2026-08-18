import { describe, expect, it } from "vitest"

import { matrixSchema } from "./matrix-schema"
import { MatrixSchema } from "./schema"
import { BUILT_IN_MATRIX } from "./vendor/generated/matrix"

// `matrixSchema` is the wire contract a fetched catalog.json is parsed with, and
// the two claims below are the whole reason it exists beside `schema.ts`'s
// `MatrixSchema`: it has to accept the catalogue this package ships, AND accept
// one from a marketplace whose ids the shipped vocabulary has never heard of.
// A schema that only manages the first is the vendored boundary we already have.

const SHIPPED_SKILL = "web-framework-react"
const SHIPPED_CATEGORY = "web-framework"
const SHIPPED_AGENT = "web-developer"

// A third-party marketplace, namespaced as `build marketplace` requires. None of
// these ids is a member of any generated union.
const FOREIGN_SKILL = "acme-house-style"
const FOREIGN_CATEGORY = "acme-conventions"
const FOREIGN_STACK = "acme-starter"

const FOREIGN_MATRIX = {
  version: "1.0.0",
  categories: {
    [FOREIGN_CATEGORY]: {
      id: FOREIGN_CATEGORY,
      displayName: "Conventions",
      description: "How Acme writes things",
      domain: "web",
      exclusive: false,
      required: false,
      order: 1,
    },
  },
  skills: {
    [FOREIGN_SKILL]: {
      id: FOREIGN_SKILL,
      slug: "house-style",
      displayName: "House Style",
      description: "Acme's own conventions",
      category: FOREIGN_CATEGORY,
      conflictsWith: [],
      discourages: [],
      requires: [],
    },
  },
  suggestedStacks: [
    {
      id: FOREIGN_STACK,
      name: "Acme starter",
      description: "Every skill Acme ships",
      skills: { [SHIPPED_AGENT]: { [FOREIGN_CATEGORY]: [FOREIGN_SKILL] } },
      allSkillIds: [FOREIGN_SKILL],
      philosophy: "",
    },
  ],
  slugMap: {
    slugToId: { "house-style": FOREIGN_SKILL },
    idToSlug: { [FOREIGN_SKILL]: "house-style" },
  },
  generatedAt: "build",
}

describe("matrixSchema", () => {
  it("accepts the vendored catalogue this package ships", () => {
    expect(matrixSchema.safeParse(BUILT_IN_MATRIX).success).toBe(true)
  })

  it("accepts a catalogue whose ids no generated union carries", () => {
    expect(matrixSchema.safeParse(FOREIGN_MATRIX).success).toBe(true)
  })

  // The reason for the pair, stated as an assertion rather than a comment: the
  // vendored boundary narrows every id to the shipped vocabulary, so a fetched
  // marketplace fails it by construction. Parsing catalog.json with that schema
  // would reject every marketplace but ours.
  it("differs from the vendored boundary, which rejects the same catalogue", () => {
    expect(MatrixSchema.safeParse(FOREIGN_MATRIX).success).toBe(false)
  })

  it("rejects a skill missing its category", () => {
    const { category: _dropped, ...withoutCategory } =
      FOREIGN_MATRIX.skills[FOREIGN_SKILL]

    expect(
      matrixSchema.safeParse({
        ...FOREIGN_MATRIX,
        skills: { [FOREIGN_SKILL]: withoutCategory },
      }).success
    ).toBe(false)
  })

  it("rejects suggestedStacks that is not an array", () => {
    expect(
      matrixSchema.safeParse({ ...FOREIGN_MATRIX, suggestedStacks: {} }).success
    ).toBe(false)
  })

  it("rejects a category whose exclusivity is missing", () => {
    const { exclusive: _dropped, ...withoutExclusive } =
      FOREIGN_MATRIX.categories[FOREIGN_CATEGORY]

    expect(
      matrixSchema.safeParse({
        ...FOREIGN_MATRIX,
        categories: { [FOREIGN_CATEGORY]: withoutExclusive },
      }).success
    ).toBe(false)
  })

  // catalog.json travels as JSON, so what a consumer parses is what
  // JSON.stringify left behind — not the object the generator held.
  it("carries a custom category through a JSON round trip", () => {
    const parsed = matrixSchema.safeParse(
      JSON.parse(JSON.stringify(FOREIGN_MATRIX))
    )

    expect(parsed.success).toBe(true)
    expect(parsed.data?.categories[FOREIGN_CATEGORY]).toStrictEqual(
      FOREIGN_MATRIX.categories[FOREIGN_CATEGORY]
    )
  })

  it("carries a custom stack through a JSON round trip", () => {
    const parsed = matrixSchema.safeParse(
      JSON.parse(JSON.stringify(FOREIGN_MATRIX))
    )

    expect(parsed.success).toBe(true)
    expect(parsed.data?.suggestedStacks).toStrictEqual(
      FOREIGN_MATRIX.suggestedStacks
    )
  })

  it("carries every shipped skill and category of the vendored catalogue", () => {
    const parsed = matrixSchema.safeParse(BUILT_IN_MATRIX)

    expect(parsed.success).toBe(true)
    expect(Object.keys(parsed.data?.skills ?? {})).toHaveLength(
      Object.keys(BUILT_IN_MATRIX.skills).length
    )
    expect(parsed.data?.skills[SHIPPED_SKILL]?.category).toBe(SHIPPED_CATEGORY)
  })
})
