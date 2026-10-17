import { describe, expect, it } from "vitest"

import { matrixSchema } from "./matrix-schema"
import { builtInMatrixSchema } from "./built-in-matrix"
import { BUILT_IN_MATRIX } from "./vendor/generated/matrix"

const SHIPPED_SKILL = "web-framework-react"
const SHIPPED_CATEGORY = "web-framework"
const SHIPPED_AGENT = "web-developer"

// Namespaced ids no generated union carries.
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

  it("differs from the vendored boundary, which rejects the same catalogue", () => {
    expect(builtInMatrixSchema.safeParse(FOREIGN_MATRIX).success).toBe(false)
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

// JSON cannot carry `undefined`, so a present-but-undefined key means a broken producer.
describe("optional fields, absent rather than undefined", () => {
  it("refuses a category whose domain is present holding undefined", () => {
    expect(
      matrixSchema.safeParse({
        ...FOREIGN_MATRIX,
        categories: {
          [FOREIGN_CATEGORY]: {
            ...FOREIGN_MATRIX.categories[FOREIGN_CATEGORY],
            domain: undefined,
          },
        },
      }).success
    ).toBe(false)
  })

  it("accepts a category with no domain at all", () => {
    const { domain: _dropped, ...withoutDomain } =
      FOREIGN_MATRIX.categories[FOREIGN_CATEGORY]

    expect(
      matrixSchema.safeParse({
        ...FOREIGN_MATRIX,
        categories: { [FOREIGN_CATEGORY]: withoutDomain },
      }).success
    ).toBe(true)
  })

  it("refuses a stack whose group is present holding undefined", () => {
    expect(
      matrixSchema.safeParse({
        ...FOREIGN_MATRIX,
        suggestedStacks: [
          { ...FOREIGN_MATRIX.suggestedStacks[0], group: undefined },
        ],
      }).success
    ).toBe(false)
  })

  it("accepts a stack that names a group", () => {
    expect(
      matrixSchema.safeParse({
        ...FOREIGN_MATRIX,
        suggestedStacks: [
          { ...FOREIGN_MATRIX.suggestedStacks[0], group: "Acme" },
        ],
      }).success
    ).toBe(true)
  })
})
