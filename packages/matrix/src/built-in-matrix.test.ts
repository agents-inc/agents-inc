import { describe, expect, it } from "vitest"

import {
  builtInMatrixSchema,
  categoryDefinitionSchema,
  resolvedSkillSchema,
  resolvedStackSchema,
} from "./built-in-matrix"
import { BUILT_IN_MATRIX } from "./vendor/generated/matrix"

// The schema is the validation boundary between the vendored CLI data and
// everything built on it, and ids are the part of it that matters: every read
// model indexes by them, looks up through them and hands them back to the CLI.
// An id a regenerated catalogue renamed or dropped has to fail here — loudly —
// rather than arrive downstream as a blank row nothing can explain.

const KNOWN_SKILL = "web-framework-react"
const KNOWN_CATEGORY = "web-framework"
const KNOWN_AGENT = "web-developer"

// What a rename or a drop looks like from in here: a plausible id that the
// generated vocabulary does not carry.
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
  required: true,
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

  // The shipped data is what every read model parses at import time, so a
  // vocabulary that drifted from it fails every module in the package at once.
  // Asserted here so that failure has one legible place to land.
  it("accepts the vendored catalogue it ships with", () => {
    expect(builtInMatrixSchema.safeParse(BUILT_IN_MATRIX).success).toBe(true)
  })
})

// An optional field on this boundary means the vendored catalogue said nothing:
// a category with no domain, a stack with no group. Only an ABSENT key says
// that. A key present holding `undefined` is a generator that assembled the
// entry and then failed to leave the field out, and it reads downstream as the
// same absence while being a different object — `Object.keys` counts it, a
// spread carries it, and `"domain" in category` answers true for a category
// that has none. Each refusal below is paired with the absence it is there to
// keep permitted, since a boundary that turned both away would have made the
// field mandatory instead. `built-in-agents.test.ts` holds the same pair for
// the one optional field on a sub-agent.
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

  // `VALID_STACK` carries no group — which is every stack the CLI emits today,
  // and what the describe above already pins. The unpinned half is the other
  // one: the field still has to accept a real value, or the tightening would
  // have retired it rather than narrowed it.
  it("accepts a stack that names a group", () => {
    expect(
      resolvedStackSchema.safeParse({ ...VALID_STACK, group: "Frontend" })
        .success
    ).toBe(true)
  })
})
