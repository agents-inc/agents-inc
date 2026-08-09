import { CATALOG, SUB_AGENT_GROUPS, resolveAssignment } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { defaultAssignmentsFor } from "./default-assignments"

// The auto-assignment rule is what turns "select a skill" into "these agents
// light up", so each clause gets pinned against the real catalog: a wrong
// answer here silently mis-installs every configuration built on it. Which
// agents a skill reaches is the shared resolver's relevance rule — the same
// one the CLI's config generator reads — so a sub-agent only ever receives a
// skill it would reasonably use; how each one loads it is the shared mapping's
// answer, domain-gated.

const FRAMEWORK_SKILL = "web-framework-react"
const CLIENT_STATE_SKILL = "web-state-zustand"
const TESTING_SKILL = "web-testing-vitest"
// Depth rather than breadth: which UI library the project uses is what a spec
// asks for when it touches the UI, so a PM reaches it without carrying it.
const WEB_DEPTH_SKILL = "web-ui-shadcn-ui"
// Named nowhere in the mapping, so every agent it reaches loads it lazily.
const UNMAPPED_WEB_SKILL = "web-animation-framer-motion"
const INFRA_SKILL = "infra-ci-cd-github-actions"
const SHARED_SKILL = "shared-security-auth-security"
const META_SKILL = "meta-design-expressive-typescript"
// The reviewer's craft: the process skill preloads by row, the domain
// checklists ride along lazily with no row at all.
const REVIEW_PROCESS_SKILL = "meta-reviewing-reviewing"
const WEB_REVIEWING_SKILL = "meta-reviewing-web-reviewing"
// The planner's own craft: one playbook per domain, all reaching the one PM.
const WEB_PLANNING_SKILL = "meta-planning-web-planning"
const CLI_PLANNING_SKILL = "meta-planning-cli-planning"
// The planners' craft, one role over: how research is run reaches the PM with
// no row at all, and the row names the researcher.
const METHODOLOGY_CRAFT_SKILL = "meta-methodology-research-methodology"
// The AI domain's breadth. The catalog gives it no framework category, so what
// an AI project is built on is the provider it calls; which speech or vision
// model a feature reaches for is depth in the same category.
const AI_PLATFORM_SKILL = "ai-provider-anthropic-sdk"
const AI_CAPABILITY_SKILL = "ai-provider-elevenlabs"
// A skill added from GitHub this session — a real id the catalog has never
// heard of.
const ADDED_SKILL = "github:acme/widget"

// The two domainless role agents: consolidated, cross-domain by role. Their
// ids trapdoor into the meta display group, but a review role and a planning
// role are not meta ones, which is why the relevance rule treats them as
// implementation agents.
const REVIEWER = "reviewer"
const PM = "pm"

const everySkillId = Object.keys(CATALOG.skillsById)

const ROSTER = SUB_AGENT_GROUPS.flatMap((group) => group.agents)

const agentIdsInDomain = (domainId: string) =>
  ROSTER.filter((agent) => agent.domainId === domainId)
    .map((agent) => agent.id as string)
    .sort()

const NON_META_FLAVOR_AGENT_IDS = ROSTER.filter(
  (agent) => agent.flavor !== "meta"
)
  .map((agent) => agent.id as string)
  .sort()

const reachOf = (skillId: string) =>
  Object.keys(defaultAssignmentsFor(skillId)).sort()

describe("defaultAssignmentsFor", () => {
  // The headline rule: a skill reaches its own domain's agents — every role
  // flavor that domain fields — plus the two cross-domain role agents, and
  // nobody else, not even lazily.
  it("assigns a web skill to every web agent plus the role agents, all enabled", () => {
    const assignments = defaultAssignmentsFor(CLIENT_STATE_SKILL)

    expect(Object.keys(assignments).sort()).toEqual(
      [...agentIdsInDomain("web"), REVIEWER, PM].sort()
    )
    expect(Object.keys(assignments).sort()).toEqual([
      "pm",
      "reviewer",
      "web-developer",
      "web-researcher",
      "web-tester",
    ])
    expect(Object.values(assignments).every((a) => a.enabled)).toBe(true)
  })

  // The domainless pair serves every domain, so a domain the roster fields no
  // implementation agents for still reaches them — and only them.
  it("assigns an infra skill to the role agents alone", () => {
    expect(reachOf(INFRA_SKILL)).toEqual([PM, REVIEWER])
  })

  it("assigns a skill from an agent-less domain to the role agents alone", () => {
    expect(reachOf("mobile-framework-react-native")).toEqual([PM, REVIEWER])
    expect(reachOf("desktop-framework-tauri")).toEqual([PM, REVIEWER])
  })

  // Cross-domain use is a shared skill's nature: every implementation-ROLE
  // agent, the reviewer included — only the meta-flavor agents stay out.
  it("assigns a shared skill to every non-meta-flavor agent", () => {
    expect(reachOf(SHARED_SKILL)).toEqual(NON_META_FLAVOR_AGENT_IDS)
  })

  // A meta skill reaches exactly the flavors its authored mapping row names,
  // across implementation domains — `developer` alone for this one — plus the
  // reviewer, which the design craft reaches with no row at all. Off the row
  // is off the roster for a meta skill, the two crafts aside.
  it("assigns a design-craft meta skill to its row's developers plus the reviewer", () => {
    expect(reachOf(META_SKILL)).toEqual([
      "ai-developer",
      "api-developer",
      "cli-developer",
      REVIEWER,
      "web-developer",
    ])
  })

  // The reviewer's craft category: the process skill by its row, the domain
  // checklists by the craft rule — lazy by absence, listed in the reviewer's
  // activation protocol rather than resident in its prompt.
  it("assigns the reviewing craft to the reviewer alone", () => {
    expect(reachOf(REVIEW_PROCESS_SKILL)).toEqual([REVIEWER])
    expect(reachOf(WEB_REVIEWING_SKILL)).toEqual([REVIEWER])

    expect(defaultAssignmentsFor(REVIEW_PROCESS_SKILL)[REVIEWER]?.load).toBe(
      "preloaded"
    )
    expect(defaultAssignmentsFor(WEB_REVIEWING_SKILL)[REVIEWER]?.load).toBe(
      "lazy"
    )
  })

  // The planner's own craft category: each domain's playbook lights up the one
  // PM, lazily and with no mapping row behind it — the reviewing checklists'
  // shape, now that the planner is domainless too.
  it("assigns the planning craft to the PM alone", () => {
    expect(reachOf(WEB_PLANNING_SKILL)).toEqual([PM])
    expect(reachOf(CLI_PLANNING_SKILL)).toEqual([PM])

    expect(defaultAssignmentsFor(WEB_PLANNING_SKILL)[PM]?.load).toBe("lazy")
    expect(defaultAssignmentsFor(CLI_PLANNING_SKILL)[PM]?.load).toBe("lazy")
  })

  // The planner's other craft, read on the surface that draws it: the PM's
  // grid lights up for the methodology skill with no mapping row behind it,
  // and lights up lazily — the researcher is the only role that carries it.
  it("assigns the methodology craft to every researcher and the PM", () => {
    const assignments = defaultAssignmentsFor(METHODOLOGY_CRAFT_SKILL)

    expect(Object.keys(assignments).sort()).toEqual([
      "ai-researcher",
      "api-researcher",
      "cli-researcher",
      "pm",
      "web-researcher",
    ])
    expect(assignments["web-researcher"]?.load).toBe("preloaded")
    expect(assignments[PM]?.load).toBe("lazy")
  })

  // The owner's ruling on added skills: relevance unknown means assigned
  // nowhere — the ••• panel handles manual assignment, and it is id-agnostic.
  it("assigns an added skill to nobody", () => {
    expect(defaultAssignmentsFor(ADDED_SKILL)).toEqual({})
  })

  // A stale id from a previous release is indistinguishable from an added one
  // here — neither reaches the catalog — and gets the same answer rather than a
  // second rule that would need a second data source to tell them apart.
  it("treats an id the catalog never had like an added one", () => {
    expect(defaultAssignmentsFor("no-such-skill")).toEqual({})
  })

  it("loads a skill the mapping does not name lazily everywhere it reaches", () => {
    const assignments = Object.values(defaultAssignmentsFor(UNMAPPED_WEB_SKILL))

    expect(assignments).not.toHaveLength(0)
    expect(assignments.every((a) => a.load === "lazy")).toBe(true)
  })

  // The framework row names every role flavor, and neither domainless role
  // agent has a domain to fail the gate on — all five targets preload.
  it("preloads a framework on every role of its own domain and on both role agents", () => {
    const assignments = Object.values(defaultAssignmentsFor(FRAMEWORK_SKILL))

    expect(assignments).toHaveLength(5)
    expect(assignments.every((a) => a.load === "preloaded")).toBe(true)
  })

  // The mapping names roles, but relevance scopes the reach first: only the
  // skill's own domain's tester ever receives it, let alone preloads it.
  it("preloads a testing skill on its own domain's tester alone", () => {
    const assignments = defaultAssignmentsFor(TESTING_SKILL)

    expect(Object.keys(assignments).sort()).toEqual(
      [...agentIdsInDomain("web"), REVIEWER, PM].sort()
    )

    const preloaded = Object.entries(assignments)
      .filter(([, a]) => a.load === "preloaded")
      .map(([agentId]) => agentId)

    expect(preloaded).toEqual(["web-tester"])
  })

  // A shared skill's row is ungated — the flavors it names preload in every
  // domain, and the flavors it omits stay lazy everywhere.
  it("loads a shared skill per its role row in every domain", () => {
    const assignments = defaultAssignmentsFor(SHARED_SKILL)

    // Shipped row: ["developer", "researcher"] — the reviewer and the PM are
    // reached like any implementation-role agent and, off the row, lazily.
    expect(assignments["web-developer"]?.load).toBe("preloaded")
    expect(assignments[REVIEWER]?.load).toBe("lazy")
    expect(assignments[PM]?.load).toBe("lazy")
    expect(assignments["web-tester"]?.load).toBe("lazy")
    expect(assignments["cli-tester"]?.load).toBe("lazy")
  })

  // The planning column on the surface that draws it: the PM's grid shows the
  // framework resident and the depth beneath it reachable but not resident,
  // which is the whole of the thinning as a user sees it.
  it("preloads a framework on the PM and keeps a depth skill lazy there", () => {
    expect(defaultAssignmentsFor(FRAMEWORK_SKILL)[PM]?.load).toBe("preloaded")
    expect(defaultAssignmentsFor(CLIENT_STATE_SKILL)[PM]?.load).toBe(
      "preloaded"
    )
    expect(defaultAssignmentsFor(WEB_DEPTH_SKILL)[PM]?.load).toBe("lazy")
  })

  // The same column for the domain the catalog gives no framework category:
  // the provider SDK is what an AI project is built on, so the PM carries it —
  // while a capability skill in that same category stays reachable and lazy,
  // which is the distinction the kind alone cannot draw.
  it("preloads an AI provider on the PM and keeps a capability skill lazy", () => {
    expect(defaultAssignmentsFor(AI_PLATFORM_SKILL)[PM]?.load).toBe("preloaded")
    expect(defaultAssignmentsFor(AI_CAPABILITY_SKILL)[PM]?.load).toBe("lazy")
  })

  // The row names the developers, so they preload it; the reviewer arrives by
  // the design craft's row-less reach and therefore lazily — it judges a diff
  // against the skill on demand rather than carrying it in every prompt.
  it("preloads a meta skill on its row's agents and keeps its craft reach lazy", () => {
    const assignments = defaultAssignmentsFor(META_SKILL)

    expect(assignments["web-developer"]?.load).toBe("preloaded")
    expect(assignments["cli-developer"]?.load).toBe("preloaded")
    expect(assignments[REVIEWER]?.load).toBe("lazy")
  })

  // The meta-FLAVOR agents carry no domain prefix — `agent-summoner` splits to
  // "agent" — so a prefix check would let them through. Their ids are what
  // this asserts on: no rule of the resolver reaches them, whatever the skill.
  // The reviewer and the PM share their display group but not their flavor, so
  // they are deliberately outside this set.
  it("never assigns a meta-flavor agent, whatever the skill", () => {
    const metaFlavorIds = new Set(
      ROSTER.filter((agent) => agent.flavor === "meta").map(
        (agent) => agent.id as string
      )
    )

    expect(metaFlavorIds.has("agent-summoner")).toBe(true)
    expect(metaFlavorIds.has(REVIEWER)).toBe(false)
    expect(metaFlavorIds.has(PM)).toBe(false)

    for (const skillId of [...everySkillId, ADDED_SKILL]) {
      for (const agentId of Object.keys(defaultAssignmentsFor(skillId))) {
        expect(metaFlavorIds.has(agentId), `${skillId}: ${agentId}`).toBe(false)
      }
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

  // One resolver, two surfaces: this module is a reshaping of the shared
  // resolver's answer, nothing more. A whole-catalog pass proves it adds no
  // rule of its own — same agents, same loads, every row enabled.
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
