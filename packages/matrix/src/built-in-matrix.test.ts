import { describe, expect, it } from "vitest"

import {
  builtInMatrixSchema,
  categoryDefinitionSchema,
  resolvedSkillSchema,
  resolvedStackSchema,
} from "./built-in-matrix"
import { BUILT_IN_MATRIX } from "./vendor/generated/matrix"

const KNOWN_SKILL = "web-framework-react"
const KNOWN_CATEGORY = "web-framework"
const KNOWN_AGENT = "web-developer"

const RENAMED_SKILL = "web-framework-reactjs"
const RENAMED_CATEGORY = "web-frameworks"
const RETIRED_AGENT = "web-engineer"

const VALID_SKILL = {
  id: KNOWN_SKILL,
  slug: "react",
  displayName: "React",
  description: "The UI library",
  category: KNOWN_CATEGORY,
  conflictsWith: [],
  discourages: [],
  requires: [],
}

const VALID_CATEGORY = {
  id: KNOWN_CATEGORY,
  displayName: "Framework",
  description: "The framework the app is built on",
  domain: "web",
  exclusive: true,
  order: 1,
}

const VALID_STACK = {
  id: "react-only",
  name: "React only",
  description: "One skill, one agent",
  skills: { [KNOWN_AGENT]: { [KNOWN_CATEGORY]: [KNOWN_SKILL] } },
  allSkillIds: [KNOWN_SKILL],
  philosophy: "Nothing but the framework",
}

const VALID_MATRIX = {
  version: "0.0.0-test",
  categories: { [KNOWN_CATEGORY]: VALID_CATEGORY },
  skills: { [KNOWN_SKILL]: VALID_SKILL },
  suggestedStacks: [VALID_STACK],
}

describe("resolvedSkillSchema", () => {
  it("accepts a skill the generated vocabulary carries", () => {
    expect(resolvedSkillSchema.safeParse(VALID_SKILL).success).toBe(true)
  })

  it("rejects a renamed skill id", () => {
    expect(
      resolvedSkillSchema.safeParse({ ...VALID_SKILL, id: RENAMED_SKILL })
        .success
    ).toBe(false)
  })

  it("rejects a renamed category", () => {
    expect(
      resolvedSkillSchema.safeParse({
        ...VALID_SKILL,
        category: RENAMED_CATEGORY,
      }).success
    ).toBe(false)
  })

  it("rejects a renamed id inside a conflict", () => {
    expect(
      resolvedSkillSchema.safeParse({
        ...VALID_SKILL,
        conflictsWith: [{ skillId: RENAMED_SKILL, reason: "gone" }],
      }).success
    ).toBe(false)
  })

  it("rejects a renamed id inside a requirement", () => {
    expect(
      resolvedSkillSchema.safeParse({
        ...VALID_SKILL,
        requires: [
          { skillIds: [RENAMED_SKILL], needsAny: false, reason: "gone" },
        ],
      }).success
    ).toBe(false)
  })
})

describe("categoryDefinitionSchema", () => {
  it("accepts a category the generated vocabulary carries", () => {
    expect(categoryDefinitionSchema.safeParse(VALID_CATEGORY).success).toBe(
      true
    )
  })

  // `z.object` strips unknown fields silently, so also check the vendored data carries no extras.
  it("ships a category as exactly the fields a read model indexes by", () => {
    expect(BUILT_IN_MATRIX.categories[KNOWN_CATEGORY]).toStrictEqual({
      id: KNOWN_CATEGORY,
      displayName: "Framework",
      description: "UI framework (React, Vue, Angular, SolidJS)",
      domain: "web",
      exclusive: true,
      order: 1,
    })

    expect(
      categoryDefinitionSchema.parse(
        BUILT_IN_MATRIX.categories[KNOWN_CATEGORY]
      ),
      "the boundary drops a field the vendored data still ships, so the parse is lossy"
    ).toStrictEqual(BUILT_IN_MATRIX.categories[KNOWN_CATEGORY])
  })

  it("rejects a renamed category id", () => {
    expect(
      categoryDefinitionSchema.safeParse({
        ...VALID_CATEGORY,
        id: RENAMED_CATEGORY,
      }).success
    ).toBe(false)
  })
})

describe("resolvedStackSchema", () => {
  it("accepts a stack naming ids the vocabulary carries", () => {
    expect(resolvedStackSchema.safeParse(VALID_STACK).success).toBe(true)
  })

  it("rejects a renamed id in the flat skill list", () => {
    expect(
      resolvedStackSchema.safeParse({
        ...VALID_STACK,
        allSkillIds: [RENAMED_SKILL],
      }).success
    ).toBe(false)
  })

  it("rejects a retired agent carrying the skills", () => {
    expect(
      resolvedStackSchema.safeParse({
        ...VALID_STACK,
        skills: { [RETIRED_AGENT]: { [KNOWN_CATEGORY]: [KNOWN_SKILL] } },
      }).success
    ).toBe(false)
  })

  it("rejects a renamed id in an agent's assignments", () => {
    expect(
      resolvedStackSchema.safeParse({
        ...VALID_STACK,
        skills: { [KNOWN_AGENT]: { [KNOWN_CATEGORY]: [RENAMED_SKILL] } },
      }).success
    ).toBe(false)
  })
})

describe("builtInMatrixSchema", () => {
  it("accepts a matrix built from the generated vocabulary", () => {
    expect(builtInMatrixSchema.safeParse(VALID_MATRIX).success).toBe(true)
  })

  it("rejects a renamed skill anywhere in the catalogue", () => {
    expect(
      builtInMatrixSchema.safeParse({
        ...VALID_MATRIX,
        skills: { [RENAMED_SKILL]: { ...VALID_SKILL, id: RENAMED_SKILL } },
      }).success
    ).toBe(false)
  })

  it("accepts the vendored catalogue it ships with", () => {
    expect(builtInMatrixSchema.safeParse(BUILT_IN_MATRIX).success).toBe(true)
  })
})

// An optional field must be absent, not present as `undefined`; each refusal is paired with the absence it permits.
describe("optional fields, absent rather than undefined", () => {
  it("refuses a category whose domain is present holding undefined", () => {
    expect(
      categoryDefinitionSchema.safeParse({
        ...VALID_CATEGORY,
        domain: undefined,
      }).success
    ).toBe(false)
  })

  it("accepts a category with no domain at all", () => {
    const { domain: _dropped, ...withoutDomain } = VALID_CATEGORY

    expect(categoryDefinitionSchema.safeParse(withoutDomain).success).toBe(true)
  })

  it("refuses a stack whose group is present holding undefined", () => {
    expect(
      resolvedStackSchema.safeParse({ ...VALID_STACK, group: undefined })
        .success
    ).toBe(false)
  })

  it("accepts a stack that names a group", () => {
    expect(
      resolvedStackSchema.safeParse({ ...VALID_STACK, group: "Frontend" })
        .success
    ).toBe(true)
  })
})
