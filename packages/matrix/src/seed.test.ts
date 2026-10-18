import { describe, expect, it } from "vitest"

import { DEFAULT_SELECTION_OPTIONS } from "./read-model/selection-defaults"
import {
  MAX_EXTERNAL_SKILL_BYTES,
  SEED_VERSION,
  installableSeedPayloadSchema,
  seedExternalSkillSchema,
  seedPayloadSchema,
  unwritableSeedAssignments,
} from "./seed"
import type { SeedLoadState, SeedScope } from "./seed"

const SKILL_MD = "SKILL.md"

const files = (over: Record<string, string> = {}) => ({
  [SKILL_MD]: "# House React\n\nWhat this skill is for.\n",
  "metadata.yaml": "slug: house-react\n",
  ...over,
})

const external = (over: Record<string, unknown> = {}) => ({
  displayName: "House React",
  description: "The house React skill.",
  categoryId: "web-framework",
  repo: "acme/skills",
  path: "skills/house-react",
  files: files(),
  ...over,
})

const payload = (over: Record<string, unknown> = {}) => ({
  v: SEED_VERSION,
  matrixVersion: "1.0.0",
  stackId: null,
  skills: {},
  agents: {},
  ...over,
})

describe("seedExternalSkillSchema", () => {
  it("carries the whole skill directory, not a single file", () => {
    const parsed = seedExternalSkillSchema.parse(external())

    expect(Object.keys(parsed.files)).toStrictEqual([SKILL_MD, "metadata.yaml"])
  })

  it("keeps nested paths, so a reference/ directory survives the trip", () => {
    const nested = files({ "reference/api.md": "# API\n" })
    const parsed = seedExternalSkillSchema.parse(external({ files: nested }))

    expect(parsed.files["reference/api.md"]).toBe("# API\n")
  })

  it("refuses a tree with no SKILL.md", () => {
    const orphaned = { "reference/api.md": "# API\n" }

    expect(
      seedExternalSkillSchema.safeParse(external({ files: orphaned })).success
    ).toBe(false)
  })

  it("refuses an empty tree", () => {
    expect(
      seedExternalSkillSchema.safeParse(external({ files: {} })).success
    ).toBe(false)
  })

  it("refuses a directory past the cap", () => {
    const huge = files({
      "reference/big.md": "x".repeat(MAX_EXTERNAL_SKILL_BYTES),
    })

    expect(
      seedExternalSkillSchema.safeParse(external({ files: huge })).success
    ).toBe(false)
  })

  it("accepts a directory at the cap", () => {
    const atCap = { [SKILL_MD]: "x".repeat(MAX_EXTERNAL_SKILL_BYTES) }

    expect(
      seedExternalSkillSchema.safeParse(external({ files: atCap })).success
    ).toBe(true)
  })

  it("counts UTF-8 bytes rather than characters", () => {
    const multibyte = { [SKILL_MD]: "€".repeat(MAX_EXTERNAL_SKILL_BYTES / 2) }

    expect(
      seedExternalSkillSchema.safeParse(external({ files: multibyte })).success
    ).toBe(false)
  })

  it("names where the skill came from, so a reader can go and look", () => {
    const parsed = seedExternalSkillSchema.parse(external())

    expect(parsed.repo).toBe("acme/skills")
    expect(parsed.path).toBe("skills/house-react")
  })

  it("requires the confirmed category", () => {
    expect(
      seedExternalSkillSchema.safeParse(external({ categoryId: "" })).success
    ).toBe(false)
  })
})

describe("seedPayloadSchema with external skills", () => {
  it("carries them keyed by the id the selection names", () => {
    const parsed = seedPayloadSchema.parse(
      payload({
        external: { "external-web-framework-house-react": external() },
      })
    )

    expect(parsed.external?.["external-web-framework-house-react"]?.repo).toBe(
      "acme/skills"
    )
  })

  it("leaves the field off a payload with nothing external in it", () => {
    expect(seedPayloadSchema.parse(payload())).not.toHaveProperty("external")
  })

  it("refuses an external entry that is not a skill directory", () => {
    const result = seedPayloadSchema.safeParse(
      payload({ external: { "external-x": external({ files: {} }) } })
    )

    expect(result.success).toBe(false)
  })
})

/** Literals, not `SEED_VERSION ± 1`, so a wrong-way bump fails. */
describe("the version", () => {
  it("is 6, the version that carries a sub-agent's Codex model", () => {
    expect(SEED_VERSION).toBe(6)
  })

  it("decodes a v6 payload", () => {
    expect(seedPayloadSchema.safeParse(payload({ v: 6 })).success).toBe(true)
  })

  it("refuses a payload minted against v5", () => {
    expect(seedPayloadSchema.safeParse(payload({ v: 5 })).success).toBe(false)
  })

  it("refuses a payload minted against a version this build does not know", () => {
    expect(seedPayloadSchema.safeParse(payload({ v: 7 })).success).toBe(false)
  })
})

// A key holding `undefined` cannot survive JSON.
describe("the payload's optional fields", () => {
  it("refuses a marketplace present holding undefined", () => {
    expect(
      seedPayloadSchema.safeParse(payload({ marketplace: undefined })).success
    ).toBe(false)
  })

  it("refuses an external map present holding undefined", () => {
    expect(
      seedPayloadSchema.safeParse(payload({ external: undefined })).success
    ).toBe(false)
  })

  it("refuses a description present holding undefined", () => {
    expect(
      seedPayloadSchema.safeParse(payload({ description: undefined })).success
    ).toBe(false)
  })

  it("accepts a payload naming the marketplace its skills come from", () => {
    expect(
      seedPayloadSchema.safeParse(
        payload({ marketplace: "github:acme/skills" })
      ).success
    ).toBe(true)
  })
})

describe("the payload's description", () => {
  const SHARED_DESCRIPTION = "Minimal stack for E2E testing"

  it("travels, so the receiver can record what the sharer's config said it was", () => {
    expect(
      seedPayloadSchema.parse(payload({ description: SHARED_DESCRIPTION }))
        .description
    ).toBe(SHARED_DESCRIPTION)
  })

  it("leaves the field off a payload whose config describes itself with nothing", () => {
    expect(seedPayloadSchema.parse(payload())).not.toHaveProperty("description")
  })

  it("would be dropped by an older consumer rather than refused", () => {
    const throughAnOlderBuild = seedPayloadSchema.parse(
      payload({ aFieldMintedAfterEveryBuildOnDisk: SHARED_DESCRIPTION })
    )

    expect(throughAnOlderBuild).not.toHaveProperty(
      "aFieldMintedAfterEveryBuildOnDisk"
    )
  })
})

const AGENT_ID = "web-developer"

const OFFERED_CODEX_MODEL = "gpt-5.6-terra"

const FULLY_SPOKEN_AGENT = {
  on: true,
  model: "opus",
  codexModel: OFFERED_CODEX_MODEL,
  effort: "high",
  scope: "global",
}

const withAgent = (agent: Record<string, unknown>) =>
  payload({ agents: { [AGENT_ID]: agent } })

describe("a sub-agent's optional fields", () => {
  it.each(["on", "model", "codexModel", "effort", "scope"])(
    "refuses `%s` present holding undefined",
    (field) => {
      const agent = { ...FULLY_SPOKEN_AGENT, [field]: undefined }

      expect(seedPayloadSchema.safeParse(withAgent(agent)).success).toBe(false)
    }
  )

  it("accepts a sub-agent that says all five, and keeps every value", () => {
    const parsed = seedPayloadSchema.parse(withAgent(FULLY_SPOKEN_AGENT))

    expect(parsed.agents[AGENT_ID]).toStrictEqual(FULLY_SPOKEN_AGENT)
  })

  it("accepts a sub-agent that says nothing at all", () => {
    expect(seedPayloadSchema.safeParse(withAgent({})).success).toBe(true)
  })
})

describe("a sub-agent's Codex model", () => {
  it("keeps an id no build offers, so the consumer can say what it dropped", () => {
    const parsed = seedPayloadSchema.parse(withAgent({ codexModel: "gpt-4o" }))

    expect(parsed.agents[AGENT_ID]).toStrictEqual({ codexModel: "gpt-4o" })
  })

  it("travels beside the Claude model rather than in its place", () => {
    const parsed = seedPayloadSchema.parse(
      withAgent({ model: "haiku", codexModel: OFFERED_CODEX_MODEL })
    )

    expect(parsed.agents[AGENT_ID]).toStrictEqual({
      model: "haiku",
      codexModel: OFFERED_CODEX_MODEL,
    })
  })

  it("refuses an empty id", () => {
    expect(
      seedPayloadSchema.safeParse(withAgent({ codexModel: "" })).success
    ).toBe(false)
  })

  it("refuses an id that is not a string", () => {
    expect(
      seedPayloadSchema.safeParse(withAgent({ codexModel: 6 })).success
    ).toBe(false)
  })
})

const REACT = "web-framework-react"

const skillAt = (
  scope: SeedScope,
  assignments: Record<string, SeedLoadState>
) => ({
  install: "plugin",
  scope,
  assignments,
})

/** A project skill on a sub-agent the `agents` map omits, so it rests at global. */
const restingPairPayload = () =>
  payload({
    skills: { [REACT]: skillAt("project", { [AGENT_ID]: "preloaded" }) },
    agents: {},
  })

// Refusal and permission are pinned together.
describe("a project skill's reach over a sub-agent", () => {
  it("resolves an unnamed sub-agent through the shared selection default", () => {
    expect(DEFAULT_SELECTION_OPTIONS.scope).toBe("global")
  })

  it("refuses a project skill on a sub-agent left at its resting scope", () => {
    const result = installableSeedPayloadSchema.safeParse(restingPairPayload())

    expect(result.success).toBe(false)
  })

  it("accepts the same pair once the sub-agent is pinned to the project", () => {
    const pinned = payload({
      skills: { [REACT]: skillAt("project", { [AGENT_ID]: "preloaded" }) },
      agents: { [AGENT_ID]: { scope: "project" } },
    })

    expect(installableSeedPayloadSchema.safeParse(pinned).success).toBe(true)
  })

  it("accepts a global skill on a sub-agent at its resting scope", () => {
    const global = payload({
      skills: { [REACT]: skillAt("global", { [AGENT_ID]: "preloaded" }) },
      agents: {},
    })

    expect(installableSeedPayloadSchema.safeParse(global).success).toBe(true)
  })

  it("ignores an assignment row naming a sub-agent pinned off", () => {
    const off = payload({
      skills: { [REACT]: skillAt("project", { [AGENT_ID]: "preloaded" }) },
      agents: { [AGENT_ID]: { on: false } },
    })

    expect(installableSeedPayloadSchema.safeParse(off).success).toBe(true)
  })

  it("names both halves of every unwritable pair, not just the first", () => {
    const two = payload({
      skills: {
        [REACT]: skillAt("project", {
          [AGENT_ID]: "preloaded",
          "api-developer": "lazy",
        }),
      },
      agents: {},
    })

    expect(
      unwritableSeedAssignments(seedPayloadSchema.parse(two))
    ).toStrictEqual([
      { skillId: REACT, agent: AGENT_ID },
      { skillId: REACT, agent: "api-developer" },
    ])
  })

  it("finds nothing to report in a payload the config model can write", () => {
    const pinned = payload({
      skills: { [REACT]: skillAt("project", { [AGENT_ID]: "preloaded" }) },
      agents: { [AGENT_ID]: { scope: "project" } },
    })

    expect(
      unwritableSeedAssignments(seedPayloadSchema.parse(pinned))
    ).toStrictEqual([])
  })
})

describe("the read schema is deliberately lenient about the same pair", () => {
  it("accepts a payload the installable schema turns away", () => {
    expect(seedPayloadSchema.safeParse(restingPairPayload()).success).toBe(true)
  })
})

describe("the vocabularies a payload speaks", () => {
  it.each(["opus", "fable", "sonnet", "haiku"])(
    "accepts a sub-agent on the %s model",
    (model) => {
      expect(seedPayloadSchema.safeParse(withAgent({ model })).success).toBe(
        true
      )
    }
  )

  it("refuses a Claude model no build offers", () => {
    expect(
      seedPayloadSchema.safeParse(withAgent({ model: "gpt-4o" })).success
    ).toBe(false)
  })

  it.each(["low", "medium", "high", "xhigh", "max"])(
    "accepts a sub-agent at %s effort",
    (effort) => {
      expect(seedPayloadSchema.safeParse(withAgent({ effort })).success).toBe(
        true
      )
    }
  )

  it("refuses an effort no build offers", () => {
    expect(
      seedPayloadSchema.safeParse(withAgent({ effort: "extreme" })).success
    ).toBe(false)
  })

  it.each(["plugin", "eject"])("accepts a skill installed by %s", (install) => {
    const skill = { ...skillAt("global", {}), install }

    expect(
      seedPayloadSchema.safeParse(payload({ skills: { [REACT]: skill } }))
        .success
    ).toBe(true)
  })

  it("refuses an install mode no build offers", () => {
    const skill = { ...skillAt("global", {}), install: "copy" }

    expect(
      seedPayloadSchema.safeParse(payload({ skills: { [REACT]: skill } }))
        .success
    ).toBe(false)
  })
})

type Refusal = { path: PropertyKey[]; message: string }

const refusalsOf = (result: {
  success: boolean
  error?: { issues: Refusal[] }
}): Refusal[] => {
  if (result.success || !result.error) throw new Error("Expected a refusal")

  return result.error.issues.map(({ path, message }) => ({ path, message }))
}

describe("what a refusal says", () => {
  it("says a skill directory must hold its SKILL.md", () => {
    const orphaned = { "reference/api.md": "# API\n" }

    expect(
      refusalsOf(
        seedExternalSkillSchema.safeParse(external({ files: orphaned }))
      )
    ).toStrictEqual([
      { path: ["files"], message: "a skill directory must hold SKILL.md" },
    ])
  })

  it("says how many bytes a skill directory may hold", () => {
    const huge = files({
      "reference/big.md": "x".repeat(MAX_EXTERNAL_SKILL_BYTES),
    })

    expect(
      refusalsOf(seedExternalSkillSchema.safeParse(external({ files: huge })))
    ).toStrictEqual([
      {
        path: ["files"],
        message: "a skill directory may not exceed 262144 bytes",
      },
    ])
  })

  it("names the project skill's assignment that has nowhere to be written", () => {
    expect(
      refusalsOf(installableSeedPayloadSchema.safeParse(restingPairPayload()))
    ).toStrictEqual([
      {
        path: ["skills", REACT, "assignments", AGENT_ID],
        message:
          "a project-scoped skill has nowhere to be written on 'web-developer', which rests at global scope",
      },
    ])
  })
})
