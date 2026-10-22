import { describe, expect, it, vi } from "vitest"

import { AGENT_DEFINITIONS } from "../generated/agents"
import type { AgentName, SkillId } from "../vendor/generated/source-types"
import {
  createAssignmentResolver,
  resolveAssignment,
  type SkillTaxonomy,
} from "./assignment-defaults"
import { CATALOG } from "./catalog"
import {
  PRELOAD_DEFAULTS,
  resolveLoadState,
  type PreloadDefaults,
} from "./preload-defaults"
import { SUB_AGENT_GROUPS } from "./sub-agents"

// Throwing factories turn any filesystem import into a failure: the module ships to the browser.
vi.mock("node:fs", () => {
  throw new Error("assignment-defaults must not import node:fs")
})
vi.mock("node:fs/promises", () => {
  throw new Error("assignment-defaults must not import node:fs/promises")
})

const WEB_SKILL: SkillId = "web-framework-react"
const API_SKILL: SkillId = "api-framework-hono"
const INFRA_SKILL: SkillId = "infra-ci-cd-github-actions"
// No mobile or desktop agents exist, so these reach only the role agents.
const MOBILE_SKILL: SkillId = "mobile-framework-react-native"
const DESKTOP_SKILL: SkillId = "desktop-framework-tauri"
const SHARED_SKILL: SkillId = "shared-security-auth-security"
// Row: ["developer"]; its design-craft category also reaches the reviewer.
const META_SKILL: SkillId = "meta-design-expressive-typescript"
const DESIGN_CRAFT_SKILLS: readonly SkillId[] = [
  "meta-design-composable-components",
  "meta-design-expressive-typescript",
]
// Row: ["researcher"]; its craft category also reaches the PM.
const METHODOLOGY_CRAFT_SKILL: SkillId = "meta-methodology-research-methodology"
// Named `meta-` but catalogued under `shared-tooling`.
const META_PREFIXED_SHARED_SKILL: SkillId = "meta-config-stack-detect"
const REVIEW_PROCESS_SKILL: SkillId = "meta-reviewing-reviewing"
const DOMAIN_REVIEWING_SKILLS: readonly SkillId[] = [
  "meta-reviewing-web-reviewing",
  "meta-reviewing-api-reviewing",
  "meta-reviewing-ai-reviewing",
  "meta-reviewing-cli-reviewing",
  "meta-reviewing-infra-reviewing",
]
const WEB_REVIEWING_SKILL: SkillId = "meta-reviewing-web-reviewing"
const DOMAIN_PLANNING_SKILLS: readonly SkillId[] = [
  "meta-planning-web-planning",
  "meta-planning-api-planning",
  "meta-planning-ai-planning",
  "meta-planning-cli-planning",
]
const WEB_PLANNING_SKILL: SkillId = "meta-planning-web-planning"

// Another marketplace's namespaced ids, placed by their own taxonomy.
const NAMESPACED_WEB_SKILL: SkillTaxonomy = {
  id: "acme-web-framework-react",
  domainId: "web",
  categoryId: "web-framework",
}
const NAMESPACED_SHARED_SKILL: SkillTaxonomy = {
  id: "acme-shared-security-auth-security",
  domainId: "shared",
  categoryId: "shared-security",
}
const NAMESPACED_REVIEWING_SKILL: SkillTaxonomy = {
  id: "acme-meta-reviewing-reviewing",
  domainId: "meta",
  categoryId: "meta-reviewing",
}

// Reached by the reviewer but not preloaded.
const DATABASE_SKILL: SkillId = "api-database-prisma"
// Reached by the PM but not preloaded.
const WEB_DEPTH_SKILL: SkillId = "web-ui-shadcn-ui"

// The planning column's breadth kinds. AI has neither and is pinned by id below.
const BREADTH_CATEGORIES = new Set<string>([
  "api-api",
  "cli-framework",
  "desktop-framework",
  "mobile-framework",
  "web-client-state",
  "web-docs",
  "web-framework",
  "web-graphql-client",
  "web-meta-framework",
  "web-rpc",
  "web-server-state",
])

// Pinned by id: these categories also hold the capability skills below.
const AI_PLATFORM_SKILLS: readonly string[] = [
  "ai-orchestration-langchain",
  "ai-orchestration-llamaindex",
  "ai-orchestration-vercel-ai-sdk",
  "ai-provider-anthropic-sdk",
  "ai-provider-cohere-sdk",
  "ai-provider-google-gemini-sdk",
  "ai-provider-mistral-sdk",
  "ai-provider-openai-sdk",
]

const AI_CAPABILITY_SKILLS: readonly string[] = [
  "ai-provider-claude-vision",
  "ai-provider-elevenlabs",
  "ai-provider-openai-whisper",
]

const REVIEWER: AgentName = "reviewer"
const PM: AgentName = "pm"
const CROSS_DOMAIN_ROLE_AGENTS: readonly string[] = [PM, REVIEWER]

const ROSTER = SUB_AGENT_GROUPS.flatMap((group) => group.agents)

const agentIdsInDomain = (domainId: string) =>
  ROSTER.filter((agent) => agent.domainId === domainId)
    .map((agent) => agent.id as string)
    .sort()

const agentIdsWithFlavor = (...flavors: readonly string[]) =>
  ROSTER.filter((agent) => flavors.includes(agent.flavor))
    .map((agent) => agent.id as string)
    .sort()

const allAgentIds = ROSTER.map((agent) => agent.id as string).sort()

const reachOf = (skillId: string) =>
  resolveAssignment(skillId)
    .map((target) => target.agentId as string)
    .sort()

describe("targeting: a domain skill reaches its own domain's agents plus the role agents", () => {
  it("reaches every web agent, both role agents, and nobody else for a web skill", () => {
    expect(reachOf(WEB_SKILL)).toStrictEqual(
      [...agentIdsInDomain("web"), ...CROSS_DOMAIN_ROLE_AGENTS].sort()
    )
    expect(reachOf(WEB_SKILL)).toStrictEqual([
      "pm",
      "reviewer",
      "web-developer",
      "web-researcher",
      "web-tester",
    ])
  })

  it("reaches every api agent, both role agents, and nobody else for an api skill", () => {
    expect(reachOf(API_SKILL)).toStrictEqual(
      [...agentIdsInDomain("api"), ...CROSS_DOMAIN_ROLE_AGENTS].sort()
    )
  })

  it("reaches only the role agents for an infra skill", () => {
    expect(reachOf(INFRA_SKILL)).toStrictEqual([...CROSS_DOMAIN_ROLE_AGENTS])
  })

  it("reaches only the role agents for a domain with no implementation agents", () => {
    expect(reachOf(MOBILE_SKILL)).toStrictEqual([...CROSS_DOMAIN_ROLE_AGENTS])
    expect(reachOf(DESKTOP_SKILL)).toStrictEqual([...CROSS_DOMAIN_ROLE_AGENTS])
  })

  it("never reaches another domain's implementation agents", () => {
    const reached = new Set(reachOf(WEB_SKILL))
    expect(reached.has("api-developer")).toBe(false)
    expect(reached.has("cli-tester")).toBe(false)
  })
})

describe("targeting: a shared skill reaches every agent the roster fields", () => {
  it("reaches the whole roster, both role agents included", () => {
    expect(reachOf(SHARED_SKILL)).toStrictEqual(allAgentIds)
    expect(new Set(reachOf(SHARED_SKILL)).has(REVIEWER)).toBe(true)
    expect(new Set(reachOf(SHARED_SKILL)).has(PM)).toBe(true)
  })

  it("reaches the meta-flavor agents too", () => {
    const reached = new Set(reachOf(SHARED_SKILL))
    expect(reached.has("agent-summoner")).toBe(true)
    expect(reached.has("codex-keeper")).toBe(true)
  })
})

describe("targeting: a meta skill reaches the flavors its row names", () => {
  // Pinned on a fixture row: every shipped meta skill falls in some craft.
  it("reaches exactly its row's flavors on top of its craft's agents", () => {
    const asTesters = createAssignmentResolver({
      [METHODOLOGY_CRAFT_SKILL]: ["tester"],
    })

    expect(
      asTesters(METHODOLOGY_CRAFT_SKILL)
        .map((target) => target.agentId as string)
        .sort()
    ).toStrictEqual(agentIdsWithFlavor("meta", "planning", "tester"))
  })

  it("reaches its craft's agents and nobody else with no row at all", () => {
    const noRows = createAssignmentResolver({})

    expect(
      noRows(METHODOLOGY_CRAFT_SKILL)
        .map((target) => target.agentId as string)
        .sort()
    ).toStrictEqual(agentIdsWithFlavor("meta", "planning"))
  })

  it("places a meta-prefixed shared-category skill by its catalog domain", () => {
    expect(reachOf(META_PREFIXED_SHARED_SKILL)).toStrictEqual(allAgentIds)
  })

  it("reaches a meta-flavor agent only when a row names the meta flavor", () => {
    const asAuthored = createAssignmentResolver({
      [METHODOLOGY_CRAFT_SKILL]: ["meta"],
    })

    expect(
      asAuthored(METHODOLOGY_CRAFT_SKILL)
        .map((target) => target.agentId as string)
        .sort()
    ).toStrictEqual([
      "agent-summoner",
      "codex-keeper",
      "convention-keeper",
      "pm",
      "skill-summoner",
    ])
  })
})

describe("targeting: the methodology craft reaches the PM lazily", () => {
  it("adds the PM and the meta agents to the researchers its row names", () => {
    expect(reachOf(METHODOLOGY_CRAFT_SKILL)).toStrictEqual(
      agentIdsWithFlavor("meta", "planning", "researcher")
    )
    expect(reachOf(METHODOLOGY_CRAFT_SKILL)).toContain(PM)
  })

  it("carries it lazily on the PM and eagerly on the row's researchers", () => {
    const byAgent = new Map(
      resolveAssignment(METHODOLOGY_CRAFT_SKILL).map((target) => [
        target.agentId,
        target.load,
      ])
    )

    expect(byAgent.get(PM)).toBe("lazy")
    expect(byAgent.get("web-researcher")).toBe("preloaded")
    expect(byAgent.get("ai-researcher")).toBe("preloaded")
  })

  it("keeps the craft reach under an empty mapping", () => {
    const noRows = createAssignmentResolver({})
    const targets = noRows(METHODOLOGY_CRAFT_SKILL)

    expect(
      targets.map((target) => target.agentId as string).sort()
    ).toStrictEqual(agentIdsWithFlavor("meta", "planning"))

    for (const target of targets) {
      expect(target.load, target.agentId).toBe("lazy")
    }
  })

  it("reaches no reviewer, developer or tester without a row", () => {
    const reached = new Set(reachOf(METHODOLOGY_CRAFT_SKILL))

    expect(reached.has(REVIEWER)).toBe(false)
    expect(reached.has("web-developer")).toBe(false)
    expect(reached.has("web-tester")).toBe(false)
    expect(reached.has("agent-summoner")).toBe(true)
  })
})

describe("targeting: the design craft reaches the reviewer lazily", () => {
  it("adds the reviewer and the meta agents to the developers its row names", () => {
    expect(reachOf(META_SKILL)).toStrictEqual(
      [...agentIdsWithFlavor("developer", "meta"), REVIEWER as string].sort()
    )
  })

  it("reaches the reviewer for every skill in the craft", () => {
    for (const skillId of DESIGN_CRAFT_SKILLS) {
      expect(reachOf(skillId), skillId).toContain(REVIEWER)
    }
  })

  it("carries it lazily on the reviewer and eagerly on the row's developers", () => {
    for (const skillId of DESIGN_CRAFT_SKILLS) {
      const byAgent = new Map(
        resolveAssignment(skillId).map((target) => [
          target.agentId,
          target.load,
        ])
      )

      expect(byAgent.get(REVIEWER), skillId).toBe("lazy")
      expect(byAgent.get("web-developer"), skillId).toBe("preloaded")
      expect(byAgent.get("api-developer"), skillId).toBe("preloaded")
    }
  })

  it("keeps the craft reach under an empty mapping", () => {
    const noRows = createAssignmentResolver({})

    for (const skillId of DESIGN_CRAFT_SKILLS) {
      expect(
        noRows(skillId)
          .map((target) => target.agentId as string)
          .sort(),
        skillId
      ).toStrictEqual(agentIdsWithFlavor("meta", "reviewer"))

      for (const target of noRows(skillId)) {
        expect(target.load, `${skillId} ${target.agentId}`).toBe("lazy")
      }
    }
  })

  it("reaches no PM or tester without a row", () => {
    const reached = new Set(reachOf(META_SKILL))

    expect(reached.has(PM)).toBe(false)
    expect(reached.has("web-tester")).toBe(false)
    expect(reached.has("agent-summoner")).toBe(true)
  })
})

describe("targeting: the reviewing craft reaches the reviewer", () => {
  it("reaches exactly the reviewer for the review process skill", () => {
    expect(reachOf(REVIEW_PROCESS_SKILL)).toStrictEqual([REVIEWER])
  })

  it("reaches exactly the reviewer for each row-less domain reviewing skill", () => {
    for (const skillId of DOMAIN_REVIEWING_SKILLS) {
      expect(reachOf(skillId), skillId).toStrictEqual([REVIEWER])
    }
  })

  it("keeps the craft reach under an empty mapping", () => {
    const noRows = createAssignmentResolver({})

    expect(
      noRows(WEB_REVIEWING_SKILL).map((target) => target.agentId as string)
    ).toStrictEqual([REVIEWER])
  })
})

describe("targeting: the planning craft reaches the PM", () => {
  it("reaches exactly the PM for each row-less domain planning skill", () => {
    for (const skillId of DOMAIN_PLANNING_SKILLS) {
      expect(reachOf(skillId), skillId).toStrictEqual([PM as string])
    }
  })

  it("never reaches the reviewer or an implementation agent", () => {
    const reached = new Set(reachOf(WEB_PLANNING_SKILL))
    expect(reached.has(REVIEWER)).toBe(false)
    expect(reached.has("web-developer")).toBe(false)
    expect(reached.has("web-researcher")).toBe(false)
  })

  it("keeps the craft reach under an empty mapping", () => {
    const noRows = createAssignmentResolver({})

    expect(
      noRows(WEB_PLANNING_SKILL).map((target) => target.agentId as string)
    ).toStrictEqual([PM])
  })

  it("carries every domain planning skill lazily", () => {
    for (const skillId of DOMAIN_PLANNING_SKILLS) {
      expect(resolveAssignment(skillId), skillId).toStrictEqual([
        { agentId: PM, load: "lazy" },
      ])
    }
  })
})

describe("targeting: a marketplace's own skill is placed by its taxonomy", () => {
  it("reaches the same agents a catalog skill of that domain reaches", () => {
    expect(
      resolveAssignment(NAMESPACED_WEB_SKILL)
        .map((target) => target.agentId as string)
        .sort()
    ).toStrictEqual(reachOf(WEB_SKILL))
  })

  it("reaches the whole roster for a shared-domain skill", () => {
    expect(
      resolveAssignment(NAMESPACED_SHARED_SKILL)
        .map((target) => target.agentId as string)
        .sort()
    ).toStrictEqual(allAgentIds)
  })

  it("reaches a role's craft for a meta skill in that craft's category", () => {
    expect(
      resolveAssignment(NAMESPACED_REVIEWING_SKILL).map(
        (target) => target.agentId as string
      )
    ).toStrictEqual([REVIEWER])
  })

  it("carries every pair it targets lazily", () => {
    for (const skill of [
      NAMESPACED_WEB_SKILL,
      NAMESPACED_SHARED_SKILL,
      NAMESPACED_REVIEWING_SKILL,
    ]) {
      for (const target of resolveAssignment(skill)) {
        expect(target.load, `${skill.id}: ${target.agentId}`).toBe("lazy")
      }
    }
  })

  it("answers a catalog skill's taxonomy exactly as it answers its id", () => {
    for (const skill of Object.values(CATALOG.skillsById)) {
      expect(resolveAssignment(skill), skill.id).toStrictEqual(
        resolveAssignment(skill.id)
      )
    }
  })
})

describe("targeting: an id outside the catalog reaches nobody", () => {
  it("resolves an added skill to no agents", () => {
    expect(resolveAssignment("github:acme/widget")).toStrictEqual([])
  })

  it("resolves an id the catalog never had to no agents", () => {
    expect(resolveAssignment("no-such-skill")).toStrictEqual([])
  })

  it("resolves a namespaced id given without its taxonomy to no agents", () => {
    expect(resolveAssignment(NAMESPACED_WEB_SKILL.id)).toStrictEqual([])
  })
})

describe("load per target", () => {
  it("answers with the shared load resolver for every pair it targets", () => {
    for (const skillId of [WEB_SKILL, API_SKILL, SHARED_SKILL, META_SKILL]) {
      for (const { agentId, load } of resolveAssignment(skillId)) {
        expect(load, `${skillId}: ${agentId}`).toBe(
          resolveLoadState({ skillId, agentId })
        )
      }
    }
  })

  it("preloads a framework on every role of its own domain and on both role agents", () => {
    for (const { agentId, load } of resolveAssignment(WEB_SKILL)) {
      expect(load, agentId).toBe("preloaded")
    }
  })

  it("loads a shared skill per its row: preloaded on named flavors, lazy on the rest", () => {
    const byAgent = new Map(
      resolveAssignment(SHARED_SKILL).map((target) => [
        target.agentId,
        target.load,
      ])
    )

    // Row: ["developer", "researcher"].
    expect(byAgent.get("web-developer")).toBe("preloaded")
    expect(byAgent.get(REVIEWER)).toBe("lazy")
    expect(byAgent.get(PM)).toBe("lazy")
    expect(byAgent.get("web-tester")).toBe("lazy")
    expect(byAgent.get("cli-tester")).toBe("lazy")
  })

  it("preloads the review process skill and keeps the domain checklists lazy", () => {
    const processTargets = resolveAssignment(REVIEW_PROCESS_SKILL)
    expect(processTargets).toStrictEqual([
      { agentId: REVIEWER, load: "preloaded" },
    ])

    for (const skillId of DOMAIN_REVIEWING_SKILLS) {
      expect(resolveAssignment(skillId), skillId).toStrictEqual([
        { agentId: REVIEWER, load: "lazy" },
      ])
    }
  })
})

describe("the reviewer's preloaded column", () => {
  const preloadedOnReviewer = Object.values(CATALOG.skillsById)
    .filter((skill) =>
      resolveAssignment(skill.id).some(
        (target) => target.agentId === REVIEWER && target.load === "preloaded"
      )
    )
    .map((skill) => skill.id)

  it("preloads exactly the rows that name the reviewer flavor", () => {
    const rowsNamingReviewer = Object.entries(PRELOAD_DEFAULTS)
      .filter(([, flavors]) => flavors.includes("reviewer"))
      .map(([skillId]) => skillId)

    expect([...preloadedOnReviewer].sort()).toStrictEqual(
      [...rowsNamingReviewer].sort()
    )
  })

  it("preloads the frameworks and the review process skill", () => {
    for (const skillId of [
      WEB_SKILL,
      API_SKILL,
      MOBILE_SKILL,
      DESKTOP_SKILL,
      REVIEW_PROCESS_SKILL,
    ]) {
      expect(preloadedOnReviewer, skillId).toContain(skillId)
    }
  })

  it("carries a per-diff skill lazily instead of preloading it", () => {
    expect(preloadedOnReviewer).not.toContain(DATABASE_SKILL)
    expect(resolveAssignment(DATABASE_SKILL)).toContainEqual({
      agentId: REVIEWER,
      load: "lazy",
    })
  })

  it("keeps the design craft off the column it reaches", () => {
    for (const skillId of DESIGN_CRAFT_SKILLS) {
      expect(preloadedOnReviewer, skillId).not.toContain(skillId)
      expect(resolveAssignment(skillId), skillId).toContainEqual({
        agentId: REVIEWER,
        load: "lazy",
      })
    }
  })
})

describe("the PM's preloaded column", () => {
  const preloadedOnPm = Object.values(CATALOG.skillsById)
    .filter((skill) =>
      resolveAssignment(skill.id).some(
        (target) => target.agentId === PM && target.load === "preloaded"
      )
    )
    .map((skill) => skill.id)

  const breadthSkillIds = Object.values(CATALOG.skillsById)
    .filter((skill) => BREADTH_CATEGORIES.has(skill.categoryId))
    .map((skill) => skill.id)

  it("preloads exactly the rows that name the planning flavor", () => {
    const rowsNamingPlanning = Object.entries(PRELOAD_DEFAULTS)
      .filter(([, flavors]) => flavors.includes("planning"))
      .map(([skillId]) => skillId)

    expect([...preloadedOnPm].sort()).toStrictEqual(
      [...rowsNamingPlanning].sort()
    )
  })

  it("preloads every domain's breadth kinds and the AI platform", () => {
    expect([...preloadedOnPm].sort()).toStrictEqual(
      [...breadthSkillIds, ...AI_PLATFORM_SKILLS].sort()
    )
  })

  it("opens with the frameworks of every domain at once", () => {
    for (const skillId of [WEB_SKILL, API_SKILL, MOBILE_SKILL, DESKTOP_SKILL]) {
      expect(preloadedOnPm, skillId).toContain(skillId)
    }
  })

  it("still reaches a demoted depth skill, lazily", () => {
    for (const skillId of [WEB_DEPTH_SKILL, DATABASE_SKILL]) {
      expect(preloadedOnPm, skillId).not.toContain(skillId)
      expect(resolveAssignment(skillId), skillId).toContainEqual({
        agentId: PM,
        load: "lazy",
      })
    }
  })

  it("keeps the AI capability skills off the column they reach", () => {
    for (const skillId of AI_PLATFORM_SKILLS) {
      expect(preloadedOnPm, skillId).toContain(skillId)
    }

    for (const skillId of AI_CAPABILITY_SKILLS) {
      expect(preloadedOnPm, skillId).not.toContain(skillId)
      expect(resolveAssignment(skillId), skillId).toContainEqual({
        agentId: PM,
        load: "lazy",
      })
    }
  })
})

describe("shape", () => {
  it("names each targeted agent exactly once", () => {
    for (const skillId of [
      WEB_SKILL,
      SHARED_SKILL,
      META_SKILL,
      REVIEW_PROCESS_SKILL,
    ]) {
      const ids = resolveAssignment(skillId).map((target) => target.agentId)
      expect(new Set(ids).size, skillId).toBe(ids.length)
    }
  })

  it("targets only agents the roster carries", () => {
    const known = new Set<string>(Object.keys(AGENT_DEFINITIONS))

    for (const skillId of [WEB_SKILL, API_SKILL, SHARED_SKILL, META_SKILL]) {
      for (const { agentId } of resolveAssignment(skillId)) {
        expect(known.has(agentId), `${skillId}: ${agentId}`).toBe(true)
      }
    }
  })
})

describe("determinism and purity", () => {
  it("answers the same for the same input", () => {
    expect(resolveAssignment(WEB_SKILL)).toStrictEqual(
      resolveAssignment(WEB_SKILL)
    )
    expect(resolveAssignment("no-such-skill")).toStrictEqual(
      resolveAssignment("no-such-skill")
    )
  })

  it("leaves the roster and mapping untouched", () => {
    const rosterBefore = JSON.stringify(SUB_AGENT_GROUPS)

    for (const skillId of [WEB_SKILL, SHARED_SKILL, META_SKILL]) {
      resolveAssignment(skillId)
    }

    expect(JSON.stringify(SUB_AGENT_GROUPS)).toBe(rosterBefore)
  })

  it("imports without reaching the filesystem", async () => {
    vi.resetModules()

    await expect(import("./assignment-defaults")).resolves.toBeDefined()
  })
})

describe("factory binding", () => {
  it("binds the exported resolver to the shipped mapping", () => {
    const fixture: PreloadDefaults = { [WEB_SKILL]: ["tester"] }
    const resolveFixture = createAssignmentResolver(fixture)

    const loads = new Map(
      resolveFixture(WEB_SKILL).map((target) => [target.agentId, target.load])
    )

    // Targeting is by domain, so every web agent and both role agents are still reached.
    expect([...loads.keys()].sort()).toStrictEqual(
      [...agentIdsInDomain("web"), ...CROSS_DOMAIN_ROLE_AGENTS].sort()
    )
    expect(loads.get("web-tester")).toBe("preloaded")
    expect(loads.get("web-developer")).toBe("lazy")
    expect(loads.get(REVIEWER)).toBe("lazy")
    expect(loads.get(PM)).toBe("lazy")
  })
})

const META_FLAVOR_AGENTS: readonly AgentName[] = [
  "agent-summoner",
  "codex-keeper",
  "convention-keeper",
  "skill-summoner",
]

const agentsReachedBy = (skill: SkillId | SkillTaxonomy) =>
  resolveAssignment(skill).map(({ agentId }) => agentId)

const loadOnFor = (skill: SkillId, agentId: AgentName) =>
  resolveAssignment(skill).find((t) => t.agentId === agentId)?.load

describe("the meta-flavor agents are inside the default system", () => {
  it("reaches every meta-flavor agent with a design skill", () => {
    for (const skill of DESIGN_CRAFT_SKILLS) {
      expect(agentsReachedBy(skill)).toEqual(
        expect.arrayContaining([...META_FLAVOR_AGENTS])
      )
    }
  })

  it("reaches every meta-flavor agent with the methodology skill", () => {
    expect(agentsReachedBy(METHODOLOGY_CRAFT_SKILL)).toEqual(
      expect.arrayContaining([...META_FLAVOR_AGENTS])
    )
  })

  it("reaches every meta-flavor agent with a shared skill", () => {
    expect(agentsReachedBy(SHARED_SKILL)).toEqual(
      expect.arrayContaining([...META_FLAVOR_AGENTS])
    )
  })

  it("keeps the reviewing craft away from the meta-flavor agents", () => {
    const reached = agentsReachedBy(WEB_REVIEWING_SKILL)
    for (const agentId of META_FLAVOR_AGENTS)
      expect(reached).not.toContain(agentId)
  })

  it("keeps the planning craft away from the meta-flavor agents", () => {
    const reached = agentsReachedBy(WEB_PLANNING_SKILL)
    for (const agentId of META_FLAVOR_AGENTS)
      expect(reached).not.toContain(agentId)
  })

  it("keeps an implementation-domain skill away from the meta-flavor agents", () => {
    const reached = agentsReachedBy(WEB_SKILL)
    for (const agentId of META_FLAVOR_AGENTS)
      expect(reached).not.toContain(agentId)
  })

  it("preloads the design and methodology crafts on the meta flavor", () => {
    for (const agentId of META_FLAVOR_AGENTS) {
      expect(loadOnFor("meta-design-expressive-typescript", agentId)).toBe(
        "preloaded"
      )
      expect(loadOnFor(METHODOLOGY_CRAFT_SKILL, agentId)).toBe("preloaded")
    }
  })

  it("carries a shared skill lazily on the meta flavor", () => {
    for (const agentId of META_FLAVOR_AGENTS)
      expect(loadOnFor(SHARED_SKILL, agentId)).toBe("lazy")
  })
})
