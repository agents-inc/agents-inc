import { describe, expect, it } from "vitest"

import {
  AgentDefinitionSchema,
  AgentDefinitionsSchema,
  CategoryDefinitionSchema,
  MatrixSchema,
  ResolvedSkillSchema,
  ResolvedStackSchema,
} from "./schema"
import { AGENT_DEFINITIONS } from "./generated/agents"
import { BUILT_IN_MATRIX } from "./vendor/generated/matrix"

// The schema is the validation boundary between the vendored CLI data and
// everything built on it, and ids are the part of it that matters: every read
// model indexes by them, looks up through them and hands them back to the CLI.
// An id a regenerated catalogue renamed or dropped has to fail here — loudly —
// rather than arrive downstream as a blank row nothing can explain.

const KNOWN_SKILL = "web-framework-react"
const KNOWN_CATEGORY = "web-framework"
const KNOWN_AGENT = "web-developer"
const KNOWN_MODEL = "opus"
const KNOWN_FLAVOR = "developer"

// What a rename or a drop looks like from in here: a plausible id that the
// generated vocabulary does not carry.
const RENAMED_SKILL = "web-framework-reactjs"
const RENAMED_CATEGORY = "web-frameworks"
const RETIRED_AGENT = "web-engineer"
const RETIRED_MODEL = "sonnet-3-5"

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

const VALID_AGENT = {
  id: KNOWN_AGENT,
  title: "Web Developer Agent",
  description: "Implements web features from specs",
  model: KNOWN_MODEL,
  tools: ["Read"],
  flavor: KNOWN_FLAVOR,
}

const VALID_MATRIX = {
  version: "0.0.0-test",
  categories: { [KNOWN_CATEGORY]: VALID_CATEGORY },
  skills: { [KNOWN_SKILL]: VALID_SKILL },
  suggestedStacks: [VALID_STACK],
}

describe("ResolvedSkillSchema", () => {
  it("accepts a skill the generated vocabulary carries", () => {
    expect(ResolvedSkillSchema.safeParse(VALID_SKILL).success).toBe(true)
  })

  it("rejects a renamed skill id", () => {
    expect(
      ResolvedSkillSchema.safeParse({ ...VALID_SKILL, id: RENAMED_SKILL })
        .success
    ).toBe(false)
  })

  it("rejects a renamed category", () => {
    expect(
      ResolvedSkillSchema.safeParse({
        ...VALID_SKILL,
        category: RENAMED_CATEGORY,
      }).success
    ).toBe(false)
  })

  it("rejects a renamed id inside a conflict", () => {
    expect(
      ResolvedSkillSchema.safeParse({
        ...VALID_SKILL,
        conflictsWith: [{ skillId: RENAMED_SKILL, reason: "gone" }],
      }).success
    ).toBe(false)
  })

  it("rejects a renamed id inside a requirement", () => {
    expect(
      ResolvedSkillSchema.safeParse({
        ...VALID_SKILL,
        requires: [
          { skillIds: [RENAMED_SKILL], needsAny: false, reason: "gone" },
        ],
      }).success
    ).toBe(false)
  })
})

describe("CategoryDefinitionSchema", () => {
  it("accepts a category the generated vocabulary carries", () => {
    expect(CategoryDefinitionSchema.safeParse(VALID_CATEGORY).success).toBe(
      true
    )
  })

  it("rejects a renamed category id", () => {
    expect(
      CategoryDefinitionSchema.safeParse({
        ...VALID_CATEGORY,
        id: RENAMED_CATEGORY,
      }).success
    ).toBe(false)
  })
})

describe("ResolvedStackSchema", () => {
  it("accepts a stack naming ids the vocabulary carries", () => {
    expect(ResolvedStackSchema.safeParse(VALID_STACK).success).toBe(true)
  })

  it("rejects a renamed id in the flat skill list", () => {
    expect(
      ResolvedStackSchema.safeParse({
        ...VALID_STACK,
        allSkillIds: [RENAMED_SKILL],
      }).success
    ).toBe(false)
  })

  it("rejects a retired agent carrying the skills", () => {
    expect(
      ResolvedStackSchema.safeParse({
        ...VALID_STACK,
        skills: { [RETIRED_AGENT]: { [KNOWN_CATEGORY]: [KNOWN_SKILL] } },
      }).success
    ).toBe(false)
  })

  it("rejects a renamed id in an agent's assignments", () => {
    expect(
      ResolvedStackSchema.safeParse({
        ...VALID_STACK,
        skills: { [KNOWN_AGENT]: { [KNOWN_CATEGORY]: [RENAMED_SKILL] } },
      }).success
    ).toBe(false)
  })
})

describe("AgentDefinitionSchema", () => {
  it("accepts an agent the roster carries", () => {
    expect(AgentDefinitionSchema.safeParse(VALID_AGENT).success).toBe(true)
  })

  it("rejects a retired agent id", () => {
    expect(
      AgentDefinitionSchema.safeParse({ ...VALID_AGENT, id: RETIRED_AGENT })
        .success
    ).toBe(false)
  })

  it("rejects a model the CLI no longer offers", () => {
    expect(
      AgentDefinitionSchema.safeParse({ ...VALID_AGENT, model: RETIRED_MODEL })
        .success
    ).toBe(false)
  })

  // `flavor` is deliberately not narrowed here — which roles are sayable is
  // authored in the read model's preload table, and `preload-defaults.test.ts`
  // holds it to the roster ("names exactly the flavors the roster carries").
})

describe("MatrixSchema", () => {
  it("accepts a matrix built from the generated vocabulary", () => {
    expect(MatrixSchema.safeParse(VALID_MATRIX).success).toBe(true)
  })

  it("rejects a renamed skill anywhere in the catalogue", () => {
    expect(
      MatrixSchema.safeParse({
        ...VALID_MATRIX,
        skills: { [RENAMED_SKILL]: { ...VALID_SKILL, id: RENAMED_SKILL } },
      }).success
    ).toBe(false)
  })

  // The shipped data is what every read model parses at import time, so a
  // vocabulary that drifted from it fails every module in the package at once.
  // Asserted here so that failure has one legible place to land.
  it("accepts the vendored catalogue it ships with", () => {
    expect(MatrixSchema.safeParse(BUILT_IN_MATRIX).success).toBe(true)
  })
})

describe("AgentDefinitionsSchema", () => {
  it("accepts the generated agent roster it ships with", () => {
    expect(AgentDefinitionsSchema.safeParse(AGENT_DEFINITIONS).success).toBe(
      true
    )
  })
})
