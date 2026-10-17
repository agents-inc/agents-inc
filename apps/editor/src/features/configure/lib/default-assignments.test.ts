import { CATALOG, SUB_AGENT_GROUPS, resolveAssignment } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { activeSkillById } from "@/stores/catalog-store"
import { defaultAssignmentsFor } from "./default-assignments"

// Pinned against the real catalog: a wrong answer silently mis-installs every
// configuration built on it.

const FRAMEWORK_SKILL = "web-framework-react"
const CLIENT_STATE_SKILL = "web-state-zustand"
const TESTING_SKILL = "web-testing-vitest"
const WEB_DEPTH_SKILL = "web-ui-shadcn-ui"
// Named nowhere in the mapping.
const UNMAPPED_WEB_SKILL = "web-animation-framer-motion"
const INFRA_SKILL = "infra-ci-cd-github-actions"
const SHARED_SKILL = "shared-security-auth-security"
const META_SKILL = "meta-design-expressive-typescript"
const REVIEW_PROCESS_SKILL = "meta-reviewing-reviewing"
const WEB_REVIEWING_SKILL = "meta-reviewing-web-reviewing"
const WEB_PLANNING_SKILL = "meta-planning-web-planning"
const CLI_PLANNING_SKILL = "meta-planning-cli-planning"
const METHODOLOGY_CRAFT_SKILL = "meta-methodology-research-methodology"
const AI_PLATFORM_SKILL = "ai-provider-anthropic-sdk"
const AI_CAPABILITY_SKILL = "ai-provider-elevenlabs"
const ADDED_SKILL = "github:acme/widget"

// Domainless role agents: in the meta display group, but not meta-flavored.
const REVIEWER = "reviewer"
const PM = "pm"

const everySkillId = Object.keys(CATALOG.skillsById)

const ROSTER = SUB_AGENT_GROUPS.flatMap((group) => group.agents)

const agentIdsInDomain = (domainId: string) =>
  ROSTER.filter((agent) => agent.domainId === domainId)
    .map((agent) => agent.id as string)
    .sort()

const ALL_AGENT_IDS = ROSTER.map((agent) => agent.id as string).sort()

const META_FLAVOR_AGENT_IDS = ROSTER.filter((agent) => agent.flavor === "meta")
  .map((agent) => agent.id as string)
  .sort()

const reachOf = (skillId: string) =>
  Object.keys(defaultAssignmentsFor(skillId)).sort()

describe("defaultAssignmentsFor", () => {
  it("assigns a web skill to every web agent plus the role agents, all enabled", () => {
    const assignments = defaultAssignmentsFor(CLIENT_STATE_SKILL)

    expect(Object.keys(assignments).sort()).toStrictEqual(
      [...agentIdsInDomain("web"), REVIEWER, PM].sort()
    )
    expect(Object.keys(assignments).sort()).toStrictEqual([
      "pm",
      "reviewer",
      "web-developer",
      "web-researcher",
      "web-tester",
    ])
    expect(Object.values(assignments).every((a) => a.enabled)).toBe(true)
  })

  it("assigns an infra skill to the role agents alone", () => {
    expect(reachOf(INFRA_SKILL)).toStrictEqual([PM, REVIEWER])
  })

  it("assigns a skill from an agent-less domain to the role agents alone", () => {
    expect(reachOf("mobile-framework-react-native")).toStrictEqual([
      PM,
      REVIEWER,
    ])
    expect(reachOf("desktop-framework-tauri")).toStrictEqual([PM, REVIEWER])
  })

  it("assigns a shared skill to every agent", () => {
    expect(reachOf(SHARED_SKILL)).toStrictEqual(ALL_AGENT_IDS)
  })

  it("assigns a design-craft meta skill to its row's developers, the reviewer and the meta agents", () => {
    expect(reachOf(META_SKILL)).toStrictEqual([
      "agent-summoner",
      "ai-developer",
      "api-developer",
      "cli-developer",
      "codex-keeper",
      "convention-keeper",
      REVIEWER,
      "skill-summoner",
      "web-developer",
    ])
  })

  it("assigns the reviewing craft to the reviewer alone", () => {
    expect(reachOf(REVIEW_PROCESS_SKILL)).toStrictEqual([REVIEWER])
    expect(reachOf(WEB_REVIEWING_SKILL)).toStrictEqual([REVIEWER])

    expect(defaultAssignmentsFor(REVIEW_PROCESS_SKILL)[REVIEWER]?.load).toBe(
      "preloaded"
    )
    expect(defaultAssignmentsFor(WEB_REVIEWING_SKILL)[REVIEWER]?.load).toBe(
      "lazy"
    )
  })

  it("assigns the planning craft to the PM alone", () => {
    expect(reachOf(WEB_PLANNING_SKILL)).toStrictEqual([PM])
    expect(reachOf(CLI_PLANNING_SKILL)).toStrictEqual([PM])

    expect(defaultAssignmentsFor(WEB_PLANNING_SKILL)[PM]?.load).toBe("lazy")
    expect(defaultAssignmentsFor(CLI_PLANNING_SKILL)[PM]?.load).toBe("lazy")
  })

  it("assigns the methodology craft to every researcher, the PM and the meta agents", () => {
    const assignments = defaultAssignmentsFor(METHODOLOGY_CRAFT_SKILL)

    expect(Object.keys(assignments).sort()).toStrictEqual([
      "agent-summoner",
      "ai-researcher",
      "api-researcher",
      "cli-researcher",
      "codex-keeper",
      "convention-keeper",
      "pm",
      "skill-summoner",
      "web-researcher",
    ])
    expect(assignments["web-researcher"]?.load).toBe("preloaded")
    expect(assignments["codex-keeper"]?.load).toBe("preloaded")
    expect(assignments[PM]?.load).toBe("lazy")
  })

  // Relevance unknown: assigned by hand from the ••• panel.
  it("assigns an added skill to nobody", () => {
    expect(defaultAssignmentsFor(ADDED_SKILL)).toStrictEqual({})
  })

  it("treats an id the catalog never had like an added one", () => {
    expect(defaultAssignmentsFor("no-such-skill")).toStrictEqual({})
  })

  it("loads a skill the mapping does not name lazily everywhere it reaches", () => {
    const assignments = Object.values(defaultAssignmentsFor(UNMAPPED_WEB_SKILL))

    expect(assignments).not.toHaveLength(0)
    expect(assignments.every((a) => a.load === "lazy")).toBe(true)
  })

  it("preloads a framework on every role of its own domain and on both role agents", () => {
    const assignments = Object.values(defaultAssignmentsFor(FRAMEWORK_SKILL))

    expect(assignments).toHaveLength(5)
    expect(assignments.every((a) => a.load === "preloaded")).toBe(true)
  })

  it("preloads a testing skill on its own domain's tester alone", () => {
    const assignments = defaultAssignmentsFor(TESTING_SKILL)

    expect(Object.keys(assignments).sort()).toStrictEqual(
      [...agentIdsInDomain("web"), REVIEWER, PM].sort()
    )

    const preloaded = Object.entries(assignments)
      .filter(([, a]) => a.load === "preloaded")
      .map(([agentId]) => agentId)

    expect(preloaded).toStrictEqual(["web-tester"])
  })

  it("loads a shared skill per its role row in every domain", () => {
    const assignments = defaultAssignmentsFor(SHARED_SKILL)

    // Shipped row: ["developer", "researcher"].
    expect(assignments["web-developer"]?.load).toBe("preloaded")
    expect(assignments[REVIEWER]?.load).toBe("lazy")
    expect(assignments[PM]?.load).toBe("lazy")
    expect(assignments["web-tester"]?.load).toBe("lazy")
    expect(assignments["cli-tester"]?.load).toBe("lazy")
  })

  it("preloads a framework on the PM and keeps a depth skill lazy there", () => {
    expect(defaultAssignmentsFor(FRAMEWORK_SKILL)[PM]?.load).toBe("preloaded")
    expect(defaultAssignmentsFor(CLIENT_STATE_SKILL)[PM]?.load).toBe(
      "preloaded"
    )
    expect(defaultAssignmentsFor(WEB_DEPTH_SKILL)[PM]?.load).toBe("lazy")
  })

  it("preloads an AI provider on the PM and keeps a capability skill lazy", () => {
    expect(defaultAssignmentsFor(AI_PLATFORM_SKILL)[PM]?.load).toBe("preloaded")
    expect(defaultAssignmentsFor(AI_CAPABILITY_SKILL)[PM]?.load).toBe("lazy")
  })

  it("preloads a meta skill on its row's agents and keeps its craft reach lazy", () => {
    const assignments = defaultAssignmentsFor(META_SKILL)

    expect(assignments["web-developer"]?.load).toBe("preloaded")
    expect(assignments["cli-developer"]?.load).toBe("preloaded")
    expect(assignments[REVIEWER]?.load).toBe("lazy")
  })

  it("assigns a meta-flavor agent only the meta and shared skills", () => {
    const metaFlavorIds = new Set(META_FLAVOR_AGENT_IDS)

    expect(metaFlavorIds.has("agent-summoner")).toBe(true)
    expect(metaFlavorIds.has(REVIEWER)).toBe(false)
    expect(metaFlavorIds.has(PM)).toBe(false)

    for (const skillId of [...everySkillId, ADDED_SKILL]) {
      const skill = activeSkillById(skillId)
      const reachesMeta = Object.keys(defaultAssignmentsFor(skillId)).some(
        (agentId) => metaFlavorIds.has(agentId)
      )
      const isMetaOrShared =
        skill?.domainId === "meta" || skill?.domainId === "shared"

      // The reviewing and planning crafts belong to one role each.
      const isRoleCraft =
        skill?.categoryId === "meta-reviewing" ||
        skill?.categoryId === "meta-planning"

      expect(reachesMeta, skillId).toBe(isMetaOrShared && !isRoleCraft)
    }
  })

  it("targets only agents that actually exist", () => {
    const agentIds = new Set(ROSTER.map((agent) => agent.id as string))

    for (const skillId of everySkillId) {
      for (const agentId of Object.keys(defaultAssignmentsFor(skillId))) {
        expect(agentIds.has(agentId), `${skillId}: ${agentId}`).toBe(true)
      }
    }
  })

  it("mirrors the shared resolver across the whole catalog", () => {
    for (const skillId of everySkillId) {
      const assignments = defaultAssignmentsFor(skillId)
      const targets = resolveAssignment(skillId)

      expect(Object.keys(assignments).length, skillId).toBe(targets.length)

      for (const target of targets) {
        expect(
          assignments[target.agentId],
          `${skillId}: ${target.agentId}`
        ).toStrictEqual({ load: target.load, enabled: true })
      }
    }
  })
})
