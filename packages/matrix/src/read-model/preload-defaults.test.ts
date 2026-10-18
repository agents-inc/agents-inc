import { describe, expect, it, vi } from "vitest"

import { AGENT_DEFINITIONS } from "../generated/agents"
import type * as GeneratedMatrix from "../vendor/generated/matrix"
import {
  SKILL_IDS,
  type AgentName,
  type SkillId,
} from "../vendor/generated/source-types"
import { skillById } from "./catalog"
import {
  PRELOAD_DEFAULTS,
  ROLE_FLAVORS,
  createLoadStateResolver,
  resolveLoadState,
  type PreloadDefaults,
  type RoleFlavor,
} from "./preload-defaults"

// Throwing factories turn any filesystem import into a failure: the module ships to the browser.
vi.mock("node:fs", () => {
  throw new Error("preload-defaults must not import node:fs")
})
vi.mock("node:fs/promises", () => {
  throw new Error("preload-defaults must not import node:fs/promises")
})

const FRAMEWORK_SKILL: SkillId = "web-framework-react"
const FRAMEWORK_CATEGORY = "web-framework"
const TESTING_SKILL: SkillId = "web-testing-vitest"
const UNLISTED_IN_FIXTURE: SkillId = "web-state-zustand"
// Shared skills skip the domain gate.
const SHARED_SKILL: SkillId = "shared-security-auth-security"
const META_SKILL: SkillId = "meta-design-expressive-typescript"
const SETUP_SHARED_SKILL: SkillId = "shared-tooling-typescript-config"
const REVIEW_PROCESS_SKILL: SkillId = "meta-reviewing-reviewing"
const DATABASE_SKILL: SkillId = "api-database-prisma"
const DATABASE_SKILL_FLAVORS: readonly RoleFlavor[] = [
  "developer",
  "researcher",
]

const STATE_SKILL: SkillId = "web-server-state-react-query"
const STATE_SKILL_FLAVORS: readonly RoleFlavor[] = [
  "developer",
  "planning",
  "researcher",
]

const AI_PROVIDER_SKILL: SkillId = "ai-provider-anthropic-sdk"
const AI_ORCHESTRATION_SKILL: SkillId = "ai-orchestration-langchain"
const AI_PLATFORM_SKILL_FLAVORS: readonly RoleFlavor[] = [
  "developer",
  "planning",
  "researcher",
]

// Pinned by id: their categories also hold the capability skills below.
const AI_PLATFORM_SKILLS: readonly SkillId[] = [
  "ai-orchestration-langchain",
  "ai-orchestration-llamaindex",
  "ai-orchestration-vercel-ai-sdk",
  "ai-provider-anthropic-sdk",
  "ai-provider-cohere-sdk",
  "ai-provider-google-gemini-sdk",
  "ai-provider-mistral-sdk",
  "ai-provider-openai-sdk",
]

const AI_CAPABILITY_SKILLS: readonly SkillId[] = [
  "ai-provider-claude-vision",
  "ai-provider-elevenlabs",
  "ai-provider-openai-whisper",
]

const METHODOLOGY_CRAFT_SKILL: SkillId = "meta-methodology-research-methodology"
const RESEARCHER_IDS = ["ai-researcher", "web-researcher"] as const

// Named, not suffix-matched: the API frameworks' category is `api-api`.
const FRAMEWORK_CATEGORIES = new Set<string>([
  "api-api",
  "cli-framework",
  "desktop-framework",
  "mobile-framework",
  "web-docs",
  "web-framework",
  "web-meta-framework",
])

const STATE_CATEGORIES = new Set<string>([
  "web-client-state",
  "web-graphql-client",
  "web-rpc",
  "web-server-state",
])

// Designated breadth: a planning row may sit here, but not every member needs one.
const AI_PLATFORM_CATEGORIES = new Set<string>([
  "ai-orchestration",
  "ai-provider",
])

const skillOrThrow = (skillId: string) => {
  const skill = skillById(skillId)
  if (!skill) throw new Error(`Skill not found: ${skillId}`)

  return skill
}

const categoryOf = (skillId: string): string => skillOrThrow(skillId).categoryId

const domainOf = (skillId: string): string => skillOrThrow(skillId).domainId

const isFrameworkSkill = (skillId: string): boolean =>
  FRAMEWORK_CATEGORIES.has(categoryOf(skillId))

const isBreadthSkill = (skillId: string): boolean =>
  isFrameworkSkill(skillId) || STATE_CATEGORIES.has(categoryOf(skillId))

const isAiPlatformSkill = (skillId: string): boolean =>
  AI_PLATFORM_CATEGORIES.has(categoryOf(skillId))

const FRAMEWORK_SKILL_FLAVORS: readonly RoleFlavor[] = [
  "developer",
  "planning",
  "researcher",
  "reviewer",
  "tester",
]
const TESTING_SKILL_FLAVORS: readonly RoleFlavor[] = ["tester"]

const WEB_DEVELOPER: AgentName = "web-developer"
const REVIEWER: AgentName = "reviewer"
const PM: AgentName = "pm"
const WEB_TESTER: AgentName = "web-tester"
const AGENT_SUMMONER: AgentName = "agent-summoner"

const FIXTURE_DEFAULTS: PreloadDefaults = {
  [FRAMEWORK_SKILL]: ["developer", "reviewer"],
  [TESTING_SKILL]: ["tester"],
}

const resolve = createLoadStateResolver(FIXTURE_DEFAULTS)

const agentIdsWithFlavor = (flavor: string) =>
  Object.values(AGENT_DEFINITIONS)
    .filter((agent) => agent.flavor === flavor)
    .map((agent) => agent.id)

describe("sparse semantics", () => {
  it("resolves a skill the table does not list to lazy", () => {
    expect(
      resolve({ skillId: UNLISTED_IN_FIXTURE, agentId: WEB_DEVELOPER })
    ).toBe("lazy")
  })

  it("resolves a listed skill on a listed flavor to preloaded", () => {
    expect(resolve({ skillId: FRAMEWORK_SKILL, agentId: WEB_DEVELOPER })).toBe(
      "preloaded"
    )
    expect(resolve({ skillId: FRAMEWORK_SKILL, agentId: REVIEWER })).toBe(
      "preloaded"
    )
  })

  it("resolves a listed skill on an unlisted flavor to lazy", () => {
    expect(resolve({ skillId: FRAMEWORK_SKILL, agentId: WEB_TESTER })).toBe(
      "lazy"
    )
    expect(resolve({ skillId: TESTING_SKILL, agentId: WEB_DEVELOPER })).toBe(
      "lazy"
    )
  })

  it("resolves an empty table to lazy for every agent on the roster", () => {
    const resolveEmpty = createLoadStateResolver({})

    for (const agent of Object.values(AGENT_DEFINITIONS)) {
      expect(
        resolveEmpty({ skillId: FRAMEWORK_SKILL, agentId: agent.id }),
        agent.id
      ).toBe("lazy")
    }
  })

  it("cannot express lazy", () => {
    const table: PreloadDefaults = {
      // @ts-expect-error — "lazy" is not a RoleFlavor; only roles are listable.
      [FRAMEWORK_SKILL]: ["lazy"],
    }

    expect(Object.keys(table)).toHaveLength(1)
  })
})

describe("resolution precedence", () => {
  it("prefers an explicit preloaded flag over a table miss", () => {
    expect(
      resolve({
        skillId: UNLISTED_IN_FIXTURE,
        agentId: WEB_DEVELOPER,
        explicit: "preloaded",
      })
    ).toBe("preloaded")
  })

  it("prefers an explicit lazy flag over a table hit", () => {
    expect(
      resolve({
        skillId: FRAMEWORK_SKILL,
        agentId: WEB_DEVELOPER,
        explicit: "lazy",
      })
    ).toBe("lazy")
  })

  it("keeps an explicit flag that agrees with the table", () => {
    expect(
      resolve({
        skillId: FRAMEWORK_SKILL,
        agentId: WEB_DEVELOPER,
        explicit: "preloaded",
      })
    ).toBe("preloaded")
  })

  it("falls through to the table when no explicit flag is given", () => {
    expect(
      resolve({
        skillId: FRAMEWORK_SKILL,
        agentId: WEB_DEVELOPER,
      })
    ).toBe("preloaded")
  })
})

describe("flavor handling", () => {
  // The `pm` agent's flavor is "planning", not "pm".
  it("resolves the pm agent through its planning flavor", () => {
    const planningTable: PreloadDefaults = { [FRAMEWORK_SKILL]: ["planning"] }
    const resolvePlanning = createLoadStateResolver(planningTable)

    expect(resolvePlanning({ skillId: FRAMEWORK_SKILL, agentId: PM })).toBe(
      "preloaded"
    )
    expect(
      resolvePlanning({ skillId: FRAMEWORK_SKILL, agentId: WEB_TESTER })
    ).toBe("lazy")
  })

  // `agent-summoner` splits to "agent", so no prefix reading can place it.
  it("resolves a prefix-less meta agent through its meta flavor", () => {
    const metaTable: PreloadDefaults = { [META_SKILL]: ["meta"] }
    const resolveMeta = createLoadStateResolver(metaTable)

    expect(resolveMeta({ skillId: META_SKILL, agentId: AGENT_SUMMONER })).toBe(
      "preloaded"
    )
  })

  it("gives every agent sharing a flavor the same answer for a shared skill", () => {
    for (const flavor of ROLE_FLAVORS) {
      const table: PreloadDefaults = { [SHARED_SKILL]: [flavor] }
      const resolveFlavor = createLoadStateResolver(table)

      for (const agentId of agentIdsWithFlavor(flavor)) {
        expect(resolveFlavor({ skillId: SHARED_SKILL, agentId }), agentId).toBe(
          "preloaded"
        )
      }
    }
  })

  it("names exactly the flavors the roster carries", () => {
    const onRoster = new Set<string>(
      Object.values(AGENT_DEFINITIONS).map((agent) => agent.flavor)
    )

    expect([...ROLE_FLAVORS].sort()).toStrictEqual([...onRoster].sort())
  })
})

describe("domain affinity gate", () => {
  it("resolves a cross-domain role match to lazy", () => {
    for (const agentId of [
      "api-developer",
      "ai-developer",
      "cli-developer",
    ] as const) {
      expect(resolve({ skillId: FRAMEWORK_SKILL, agentId }), agentId).toBe(
        "lazy"
      )
    }
  })

  it("still preloads on the skill's own domain", () => {
    expect(resolve({ skillId: FRAMEWORK_SKILL, agentId: WEB_DEVELOPER })).toBe(
      "preloaded"
    )
  })

  it("takes a row as authored on either domainless role agent", () => {
    expect(resolve({ skillId: FRAMEWORK_SKILL, agentId: REVIEWER })).toBe(
      "preloaded"
    )
    for (const agentId of [REVIEWER, PM]) {
      expect(
        resolveLoadState({
          skillId: "mobile-framework-react-native",
          agentId,
        }),
        agentId
      ).toBe("preloaded")
    }
  })

  it("leaves a shared skill ungated: the row preloads on every domain", () => {
    const table: PreloadDefaults = { [SHARED_SKILL]: ["developer"] }
    const resolveShared = createLoadStateResolver(table)

    for (const agentId of agentIdsWithFlavor("developer")) {
      expect(resolveShared({ skillId: SHARED_SKILL, agentId }), agentId).toBe(
        "preloaded"
      )
    }
  })

  it("leaves a meta skill's rows as authored", () => {
    expect(
      resolveLoadState({ skillId: META_SKILL, agentId: WEB_DEVELOPER })
    ).toBe("preloaded")
    expect(resolveLoadState({ skillId: META_SKILL, agentId: REVIEWER })).toBe(
      "lazy"
    )
    expect(resolveLoadState({ skillId: META_SKILL, agentId: WEB_TESTER })).toBe(
      "lazy"
    )
    expect(
      resolveLoadState({ skillId: REVIEW_PROCESS_SKILL, agentId: REVIEWER })
    ).toBe("preloaded")
  })

  it("keeps a meta-flavor agent to a meta skill's row, not a domain skill's", () => {
    const resolveMetaRows = createLoadStateResolver({
      [META_SKILL]: ["meta"],
      [FRAMEWORK_SKILL]: ["meta"],
    })

    expect(
      resolveMetaRows({ skillId: META_SKILL, agentId: AGENT_SUMMONER })
    ).toBe("preloaded")
    expect(
      resolveMetaRows({ skillId: FRAMEWORK_SKILL, agentId: AGENT_SUMMONER })
    ).toBe("lazy")
  })

  it("lets an explicit flag beat the gate", () => {
    expect(
      resolve({
        skillId: FRAMEWORK_SKILL,
        agentId: "api-developer",
        explicit: "preloaded",
      })
    ).toBe("preloaded")
  })
})

describe("data integrity", () => {
  it("throws on a skill id that does not exist", () => {
    expect(() =>
      resolve({
        // Cast: a deliberately invalid id.
        skillId: "no-such-skill" as SkillId,
        agentId: WEB_DEVELOPER,
      })
    ).toThrow(/no-such-skill/)
  })

  it("throws on an agent id that does not exist", () => {
    expect(() =>
      resolve({
        skillId: FRAMEWORK_SKILL,
        // Cast: a deliberately invalid id.
        agentId: "no-such-agent" as AgentName,
      })
    ).toThrow(/no-such-agent/)
  })

  it("throws on an unknown id even when an explicit flag is given", () => {
    expect(() =>
      resolve({
        // Cast: a deliberately invalid id.
        skillId: "no-such-skill" as SkillId,
        agentId: WEB_DEVELOPER,
        explicit: "preloaded",
      })
    ).toThrow(/no-such-skill/)
  })

  it("throws on a roster flavor ROLE_FLAVORS does not name", async () => {
    vi.resetModules()
    vi.doMock("../generated/agents", () => ({
      AGENT_DEFINITIONS: {
        [WEB_DEVELOPER]: { id: WEB_DEVELOPER, flavor: "architect" },
      },
    }))

    const { resolveLoadState: resolveRogueRoster } =
      await import("./preload-defaults")

    expect(() =>
      resolveRogueRoster({ skillId: FRAMEWORK_SKILL, agentId: WEB_DEVELOPER })
    ).toThrow(/architect/)

    vi.doUnmock("../generated/agents")
    vi.resetModules()
  })

  it("throws on a shipped skill whose category the catalogue cannot place", async () => {
    vi.resetModules()
    vi.doMock("../vendor/generated/matrix", async (importOriginal) => {
      const { BUILT_IN_MATRIX } = await importOriginal<typeof GeneratedMatrix>()
      const placed = BUILT_IN_MATRIX.categories[FRAMEWORK_CATEGORY]
      if (!placed) throw new Error(`Category not found: ${FRAMEWORK_CATEGORY}`)
      const { domain: _dropped, ...unplaced } = placed

      return {
        BUILT_IN_MATRIX: {
          ...BUILT_IN_MATRIX,
          categories: {
            ...BUILT_IN_MATRIX.categories,
            [FRAMEWORK_CATEGORY]: unplaced,
          },
        },
      }
    })

    const { resolveLoadState: resolveUnplaced } =
      await import("./preload-defaults")

    expect(() =>
      resolveUnplaced({ skillId: FRAMEWORK_SKILL, agentId: WEB_DEVELOPER })
    ).toThrow(`Skill domain not found: ${FRAMEWORK_SKILL}`)

    vi.doUnmock("../vendor/generated/matrix")
    vi.resetModules()
  })

  it("rejects a table key outside the generated skill union", () => {
    const table: PreloadDefaults = {
      // @ts-expect-error — "no-such-skill" is not a SkillId.
      "no-such-skill": ["developer"],
    }

    expect(Object.keys(table)).toHaveLength(1)
  })

  it("rejects a table flavor outside the roster's roles", () => {
    const table: PreloadDefaults = {
      // @ts-expect-error — "architect" is not a RoleFlavor.
      [FRAMEWORK_SKILL]: ["architect"],
    }

    expect(Object.keys(table)).toHaveLength(1)
  })
})

// The resolver works for any table; these are the only guard on the shipped data.
describe("PRELOAD_DEFAULTS", () => {
  const entries = Object.entries(PRELOAD_DEFAULTS)

  it("ships a table", () => {
    expect(PRELOAD_DEFAULTS).toBeTypeOf("object")
    expect(entries.length).toBeGreaterThan(0)
  })

  it("keys every entry on a skill the catalog knows", () => {
    const known = new Set<string>(SKILL_IDS)

    for (const [skillId] of entries) {
      expect(known.has(skillId), skillId).toBe(true)
    }
  })

  it("lists only flavors the roster carries", () => {
    const onRoster = new Set<string>(
      Object.values(AGENT_DEFINITIONS).map((agent) => agent.flavor)
    )

    for (const [skillId, flavors] of entries) {
      for (const flavor of flavors) {
        expect(onRoster.has(flavor), `${skillId}: ${flavor}`).toBe(true)
      }
    }
  })

  it("lists at least one flavor per entry", () => {
    for (const [skillId, flavors] of entries) {
      expect(flavors.length, skillId).toBeGreaterThan(0)
    }
  })

  it("names each flavor once per entry", () => {
    for (const [skillId, flavors] of entries) {
      const listed = flavors
      expect(new Set(listed).size, skillId).toBe(listed.length)
    }
  })

  it("lists only flavors ROLE_FLAVORS names", () => {
    const listable = new Set<string>(ROLE_FLAVORS)

    for (const [skillId, flavors] of entries) {
      for (const flavor of flavors) {
        expect(listable.has(flavor), `${skillId}: ${flavor}`).toBe(true)
      }
    }
  })

  it("lists each entry's flavors in ROLE_FLAVORS order", () => {
    const rank = (flavor: RoleFlavor) => ROLE_FLAVORS.indexOf(flavor)

    for (const [skillId, flavors] of entries) {
      const listed = [...flavors]
      expect(
        [...listed].sort((a, b) => rank(a) - rank(b)),
        skillId
      ).toStrictEqual(listed)
    }
  })

  it("holds no entry for a setup skill", () => {
    for (const [skillId] of entries) {
      expect(skillId.includes("-setup-"), skillId).toBe(false)
    }
  })

  // Pinned by name so a bulk edit cannot pass the shape checks alone.
  it("preloads the framework skill on every role that builds with it", () => {
    expect(PRELOAD_DEFAULTS[FRAMEWORK_SKILL]).toStrictEqual(
      FRAMEWORK_SKILL_FLAVORS
    )
  })

  it("preloads a testing skill on the tester alone", () => {
    expect(PRELOAD_DEFAULTS[TESTING_SKILL]).toStrictEqual(TESTING_SKILL_FLAVORS)
  })

  it("preloads the review process skill on the reviewer flavor", () => {
    expect(PRELOAD_DEFAULTS[REVIEW_PROCESS_SKILL]).toStrictEqual(["reviewer"])
  })

  it("holds no entry for the domain reviewing checklists", () => {
    for (const skillId of [
      "meta-reviewing-web-reviewing",
      "meta-reviewing-api-reviewing",
      "meta-reviewing-ai-reviewing",
      "meta-reviewing-cli-reviewing",
      "meta-reviewing-infra-reviewing",
    ] as const) {
      expect(PRELOAD_DEFAULTS[skillId], skillId).toBeUndefined()
      expect(resolveLoadState({ skillId, agentId: REVIEWER }), skillId).toBe(
        "lazy"
      )
    }
  })

  it("holds no entry for the domain planning playbooks", () => {
    for (const skillId of [
      "meta-planning-web-planning",
      "meta-planning-api-planning",
      "meta-planning-ai-planning",
      "meta-planning-cli-planning",
    ] as const) {
      expect(PRELOAD_DEFAULTS[skillId], skillId).toBeUndefined()
      expect(resolveLoadState({ skillId, agentId: PM }), skillId).toBe("lazy")
    }
  })

  it("keeps the reviewer flavor on every framework entry", () => {
    for (const [skillId, flavors] of entries) {
      if (!isFrameworkSkill(skillId)) continue

      expect(flavors, skillId).toContain("reviewer")
    }
  })

  it("names the reviewer flavor nowhere but a framework and the process", () => {
    for (const [skillId, flavors] of entries) {
      if (!flavors.includes("reviewer")) continue

      expect(
        isFrameworkSkill(skillId) || skillId === REVIEW_PROCESS_SKILL,
        skillId
      ).toBe(true)
    }
  })

  it("keeps the planning flavor on every framework and state entry", () => {
    for (const [skillId, flavors] of entries) {
      if (!isBreadthSkill(skillId)) continue

      expect(flavors, skillId).toContain("planning")
    }
  })

  it("names the planning flavor nowhere but a framework, a state kind or the AI platform", () => {
    for (const [skillId, flavors] of entries) {
      if (!flavors.includes("planning")) continue

      expect(
        isBreadthSkill(skillId) || isAiPlatformSkill(skillId),
        skillId
      ).toBe(true)
    }
  })

  it("names the planning flavor on the AI platform rows and nowhere else in the domain", () => {
    const aiRowsNamingPlanning = entries
      .filter(
        ([skillId, flavors]) =>
          domainOf(skillId) === "ai" && flavors.includes("planning")
      )
      .map(([skillId]) => skillId)

    expect([...aiRowsNamingPlanning].sort()).toStrictEqual(
      [...AI_PLATFORM_SKILLS].sort()
    )
  })

  it("preloads a database skill on the roles that build with it alone", () => {
    expect(PRELOAD_DEFAULTS[DATABASE_SKILL]).toStrictEqual(
      DATABASE_SKILL_FLAVORS
    )
  })

  it("preloads a state skill on the planner as well as the builders", () => {
    expect(PRELOAD_DEFAULTS[STATE_SKILL]).toStrictEqual(STATE_SKILL_FLAVORS)
  })

  it("preloads an AI platform skill on the planner as well as the builders", () => {
    expect(PRELOAD_DEFAULTS[AI_PROVIDER_SKILL]).toStrictEqual(
      AI_PLATFORM_SKILL_FLAVORS
    )
    expect(PRELOAD_DEFAULTS[AI_ORCHESTRATION_SKILL]).toStrictEqual(
      AI_PLATFORM_SKILL_FLAVORS
    )
    expect(resolveLoadState({ skillId: AI_PROVIDER_SKILL, agentId: PM })).toBe(
      "preloaded"
    )
  })

  it("holds no entry for an AI capability skill", () => {
    for (const skillId of AI_CAPABILITY_SKILLS) {
      expect(PRELOAD_DEFAULTS[skillId], skillId).toBeUndefined()

      for (const agentId of [PM, "ai-developer"] as const) {
        expect(resolveLoadState({ skillId, agentId }), skillId).toBe("lazy")
      }
    }
  })

  it("preloads the methodology craft on the researcher and keeps the PM lazy", () => {
    expect(PRELOAD_DEFAULTS[METHODOLOGY_CRAFT_SKILL]).toStrictEqual([
      "researcher",
      "meta",
    ])

    for (const agentId of RESEARCHER_IDS) {
      expect(
        resolveLoadState({ skillId: METHODOLOGY_CRAFT_SKILL, agentId }),
        agentId
      ).toBe("preloaded")
    }

    expect(
      resolveLoadState({ skillId: METHODOLOGY_CRAFT_SKILL, agentId: PM })
    ).toBe("lazy")
  })

  it("holds no entry for a one-time setup skill in a shared domain", () => {
    for (const agent of Object.values(AGENT_DEFINITIONS)) {
      expect(
        resolveLoadState({ skillId: SETUP_SHARED_SKILL, agentId: agent.id }),
        agent.id
      ).toBe("lazy")
    }

    expect(PRELOAD_DEFAULTS[SETUP_SHARED_SKILL]).toBeUndefined()
  })

  it("is what the exported resolver resolves against", () => {
    const resolveShipped = createLoadStateResolver(PRELOAD_DEFAULTS)

    for (const agent of Object.values(AGENT_DEFINITIONS)) {
      for (const skillId of [
        FRAMEWORK_SKILL,
        TESTING_SKILL,
        UNLISTED_IN_FIXTURE,
      ]) {
        const input = { skillId, agentId: agent.id }
        expect(resolveLoadState(input), `${agent.id}: ${skillId}`).toBe(
          resolveShipped(input)
        )
      }
    }
  })
})

describe("determinism and purity", () => {
  it("answers the same for the same input", () => {
    const input = { skillId: FRAMEWORK_SKILL, agentId: WEB_DEVELOPER } as const

    expect(resolve(input)).toBe(resolve(input))
    expect(resolveLoadState(input)).toBe(resolveLoadState(input))
  })

  it("leaves the table it resolves against untouched", () => {
    const before = JSON.stringify(PRELOAD_DEFAULTS)

    for (const agent of Object.values(AGENT_DEFINITIONS)) {
      resolveLoadState({ skillId: FRAMEWORK_SKILL, agentId: agent.id })
      resolveLoadState({
        skillId: TESTING_SKILL,
        agentId: agent.id,
        explicit: "preloaded",
      })
    }

    expect(JSON.stringify(PRELOAD_DEFAULTS)).toBe(before)
  })

  it("imports without reaching the filesystem", async () => {
    vi.resetModules()

    await expect(import("./preload-defaults")).resolves.toBeDefined()
  })
})
