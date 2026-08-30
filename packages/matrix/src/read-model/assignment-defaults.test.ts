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

// The one place that answers "which sub-agents does a freshly picked skill
// reach, and how does each of them load it?". Both surfaces resolve against it
// — the editor's default assignments and the CLI's config generator — so the
// owner's relevance ruling ("only add skills to subagents that will reasonably
// use it") is pinned here once instead of drifting into two spellings.

// Both consumers must be safe to bundle for the browser, so the module may not
// reach the filesystem — at import time or ever. A factory that throws turns any
// such import into a failure instead of a silent Node-only dependency.
vi.mock("node:fs", () => {
  throw new Error("assignment-defaults must not import node:fs")
})
vi.mock("node:fs/promises", () => {
  throw new Error("assignment-defaults must not import node:fs/promises")
})

const WEB_SKILL: SkillId = "web-framework-react"
const API_SKILL: SkillId = "api-framework-hono"
const INFRA_SKILL: SkillId = "infra-ci-cd-github-actions"
// The roster fields no mobile or desktop agents, so these two domains reach
// only the cross-domain role agents.
const MOBILE_SKILL: SkillId = "mobile-framework-react-native"
const DESKTOP_SKILL: SkillId = "desktop-framework-tauri"
const SHARED_SKILL: SkillId = "shared-security-auth-security"
// Shipped row: ["developer"] — and a design-craft category, so the reviewer
// is reached row-lessly on top of the flavors the row names.
const META_SKILL: SkillId = "meta-design-expressive-typescript"
// The design craft in full: how code is meant to read. Every developer writes
// a diff with it, and the reviewer judges one against it.
const DESIGN_CRAFT_SKILLS: readonly SkillId[] = [
  "meta-design-composable-components",
  "meta-design-expressive-typescript",
]
// The planners' methodology craft — how research is run. Shipped row:
// ["researcher"], and by the owner's 2026-08-07 ruling its category reaches
// the PM row-lessly, the way the design craft reaches the reviewer.
const METHODOLOGY_CRAFT_SKILL: SkillId = "meta-methodology-research-methodology"
// An id-prefix liar: named `meta-` but catalogued under `shared-tooling`, so
// the shared rule — not the meta rule — is what places it.
const META_PREFIXED_SHARED_SKILL: SkillId = "meta-config-stack-detect"
// The reviewer's craft: the process skill preloads by row, the domain
// checklists ride along lazily with no row at all.
const REVIEW_PROCESS_SKILL: SkillId = "meta-reviewing-reviewing"
const DOMAIN_REVIEWING_SKILLS: readonly SkillId[] = [
  "meta-reviewing-web-reviewing",
  "meta-reviewing-api-reviewing",
  "meta-reviewing-ai-reviewing",
  "meta-reviewing-cli-reviewing",
  "meta-reviewing-infra-reviewing",
]
const WEB_REVIEWING_SKILL: SkillId = "meta-reviewing-web-reviewing"
// The planners' craft: one playbook per domain, each carrying no row and each
// reaching the one consolidated PM, lazily — the reviewing checklists' shape
// one role over, now that the planner is domainless too.
const DOMAIN_PLANNING_SKILLS: readonly SkillId[] = [
  "meta-planning-web-planning",
  "meta-planning-api-planning",
  "meta-planning-ai-planning",
  "meta-planning-cli-planning",
]
const WEB_PLANNING_SKILL: SkillId = "meta-planning-web-planning"

// A marketplace's own skills, ids namespaced per the marketplace-prefix rule
// and therefore members of no catalogue-keyed table, each carrying the taxonomy
// its own metadata states. One per branch of the targeting rule, so what places
// each of them is the branch rather than the catalogue.
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

// A skill the reviewer reaches but no longer preloads: what to watch for in
// one database diff is per-diff material, not every prompt's.
const DATABASE_SKILL: SkillId = "api-database-prisma"
// The same for the PM: which UI library the project uses is depth the spec
// asks for when it touches the UI, not every session's breadth.
const WEB_DEPTH_SKILL: SkillId = "web-ui-shadcn-ui"

// The planning column's breadth for every domain that has these kinds: what a
// project is built with, and where it keeps its state. Named by category
// rather than by the ids that fall in them — the ids are the table's business,
// the kinds are the owner's rule, and a new framework skill should join the
// column by arriving. `web-docs`, `web-graphql-client` and `web-rpc` are here
// because the kinds they hold were split out of `web-meta-framework` and
// `web-server-state`, not because a new kind joined the column.
//
// The AI domain has neither kind and is ruled separately — see the AI platform
// ids below, which are pinned by id because their designated categories hold
// capability skills alongside the platform ones.
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

// The AI domain's contribution to the eager column, which the owner's
// 2026-08-07 breadth ruling is what makes nonzero: the five provider SDKs and
// the three orchestration frameworks. Pinned by id rather than by category the
// way the kinds above are — the same two categories also hold the capability
// skills, so the kind is not the whole answer here.
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

// What an AI project may reach for rather than what it is built on: speech,
// vision, transcription. Reached like any AI skill, off the eager column.
const AI_CAPABILITY_SKILLS: readonly string[] = [
  "ai-provider-claude-vision",
  "ai-provider-elevenlabs",
  "ai-provider-openai-whisper",
]

// The two domainless role agents: consolidated, cross-domain by role. Every
// implementation domain's skills reach both, which is what the pair below is
// added to a domain's own agents to express. Written in the sorted order every
// reach is read back in, so it can be compared against one directly.
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

// The implementation roster: everyone whose ROLE is not meta. The two
// domainless role agents trapdoor into the meta display group, but a review
// role and a planning role are not meta ones, so shared skills reach them like
// any implementation agent.
// Every agent the roster fields. A shared skill reaches all of them since the
// owner's 2026-08-30 ruling (CLI-846) — the tooling a repository is built with
// is the convention-keeper's subject as much as the developer's.
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

  // The domainless pair serves every domain — any diff is the reviewer's
  // material and any feature is the PM's — so a domain the roster fields no
  // implementation agents for still reaches them, and only them.
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

  // Reversed by CLI-846. The exclusion read as a rule about meta agents and was
  // really a rule about nothing: a shared skill is what every workspace is built
  // with, and the agents that keep conventions and document the codebase are the
  // ones most often asked about it.
  it("reaches the meta-flavor agents too", () => {
    const reached = new Set(reachOf(SHARED_SKILL))
    expect(reached.has("agent-summoner")).toBe(true)
    expect(reached.has("codex-keeper")).toBe(true)
  })
})

describe("targeting: a meta skill reaches the flavors its row names", () => {
  // A row is the whole of a meta skill's reach wherever no craft claims it, so
  // a flavor it stops naming is a flavor it stops reaching. Pinned on a
  // fixture row: every meta skill the catalog ships now falls in one craft or
  // another, so a shipped row alone can no longer show what a row does.
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

  // The domain is the catalog's category-derived one, never the id prefix: a
  // `meta-` named skill that lives in a shared category takes the shared rule.
  it("places a meta-prefixed shared-category skill by its catalog domain", () => {
    expect(reachOf(META_PREFIXED_SHARED_SKILL)).toStrictEqual(allAgentIds)
  })

  // Read against the row-less answer above, so what the row adds is what this
  // pins and a craft's reach cannot be mistaken for the row's work.
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

// The planners' methodology craft, by the owner's 2026-08-07 ruling: the
// parity the design craft got one role over. How research is run is what a
// spec's evidence is gathered by, so the PM reaches it with no row at all —
// and row-less is what makes it lazy. The rows still answer for eagerness, and
// this one names the researcher alone, so a researcher's copy is resident
// where the PM's arrives when the spec calls for it.
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

  // The craft reach does not depend on the table: an empty mapping still
  // routes the methodology skill to the PM — lazily — because the reach is
  // the ruling's and only the researchers' eagerness was ever the row's.
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

  // The reach is the two crafts' alone: a methodology skill is neither a diff
  // checklist nor a design body, so no implementation-role agent picks it up
  // row-lessly. The meta agents do, since CLI-846 — how research is run is what
  // the codex-keeper documents a codebase with and what the skill-summoner
  // researches a new skill with.
  it("reaches no reviewer, developer or tester without a row", () => {
    const reached = new Set(reachOf(METHODOLOGY_CRAFT_SKILL))

    expect(reached.has(REVIEWER)).toBe(false)
    expect(reached.has("web-developer")).toBe(false)
    expect(reached.has("web-tester")).toBe(false)
    expect(reached.has("agent-summoner")).toBe(true)
  })
})

// The design craft — how code is meant to read. Every developer writes a diff
// with it, which is what its row says; the reviewer judges one against it,
// which no row says, so the owner's 2026-08-06 ruling reaches the reviewer the
// same row-less way the reviewing craft does. Row-less is what makes it lazy:
// the reviewer's copy arrives when a diff calls for it, where a developer's is
// resident in the prompt.
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

  // The craft reach does not depend on the table: an empty mapping still
  // routes a design skill to the reviewer — lazily — because the reach is the
  // ruling's and only the developers' eagerness was ever the row's.
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

  // The reach is the two crafts' alone: a design skill is neither a planning
  // playbook nor a diff checklist, so no implementation-role agent picks it up
  // row-lessly. The meta agents do, since CLI-846 — how code is meant to read is
  // the convention-keeper's whole subject.
  it("reaches no PM or tester without a row", () => {
    const reached = new Set(reachOf(META_SKILL))

    expect(reached.has(PM)).toBe(false)
    expect(reached.has("web-tester")).toBe(false)
    expect(reached.has("agent-summoner")).toBe(true)
  })
})

// The reviewer's own craft category. The process skill preloads per its row;
// the domain checklists carry NO row — lazy by absence, per the owner's
// loading design — yet still reach the reviewer, because being listed in its
// activation protocol and loaded per-diff is the whole point of them.
describe("targeting: the reviewing craft reaches the reviewer", () => {
  it("reaches exactly the reviewer for the review process skill", () => {
    expect(reachOf(REVIEW_PROCESS_SKILL)).toStrictEqual([REVIEWER])
  })

  it("reaches exactly the reviewer for each row-less domain reviewing skill", () => {
    for (const skillId of DOMAIN_REVIEWING_SKILLS) {
      expect(reachOf(skillId), skillId).toStrictEqual([REVIEWER])
    }
  })

  // The craft reach does not depend on the table: an empty mapping still
  // routes the checklists to the reviewer — lazily — because absence is the
  // design, not an accident of the shipped rows.
  it("keeps the craft reach under an empty mapping", () => {
    const noRows = createAssignmentResolver({})

    expect(
      noRows(WEB_REVIEWING_SKILL).map((target) => target.agentId as string)
    ).toStrictEqual([REVIEWER])
  })
})

// The planners' craft category, and the reviewing checklists' shape one role
// over now that the planner is domainless too: each playbook carries NO row —
// lazy by absence — and reaches the one PM whatever domain it plans for, which
// is what keeps a web spec and a CLI spec the same agent's work.
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

  // The craft reach does not depend on the table: an empty mapping still
  // routes each playbook to the PM — lazily — because absence is the design,
  // not an accident of the shipped rows.
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

// A marketplace other than the public one namespaces its ids, so none of them
// is a member of the catalogue's `SkillId` union and no catalogue lookup can
// answer for them. Targeting never needed one: the branches read a domain and a
// category, and a marketplace's skill carries both in its own metadata. A
// caller holding them says so, and is answered on them.
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

  // The craft branch reads the category alone, so a marketplace's reviewing
  // checklist reaches the reviewer the same row-less way the catalog's do.
  it("reaches a role's craft for a meta skill in that craft's category", () => {
    expect(
      resolveAssignment(NAMESPACED_REVIEWING_SKILL).map(
        (target) => target.agentId as string
      )
    ).toStrictEqual([REVIEWER])
  })

  // Eagerness is the row's answer and a row is keyed by a catalog id, so a
  // marketplace's skill has none to match — absence is lazy, exactly as it is
  // for a catalog skill the table leaves out.
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

  // The two ways of naming one catalog skill must not diverge: a caller that
  // states the taxonomy gets what the catalogue would have supplied for it,
  // for every skill the catalogue ships rather than for a chosen few.
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

  // The guard the docstring describes, narrowed rather than removed: a
  // namespaced id ALONE names no domain, and an id whose relevance is unknown
  // is still handed to manual assignment rather than to a default.
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

  // The framework row names every role flavor, and neither domainless role
  // agent has a domain to fail the gate on — their preloads are the rows as
  // authored.
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

    // Shipped row: ["developer", "researcher"] — the reviewer and the PM are
    // reached like any implementation-role agent and, off the row, lazily.
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

// The reviewer's column as a fresh pick actually compiles it, across the whole
// catalog rather than skill by skill: eagerly, the framework a diff is written
// in and the review process; lazily, everything else it carries — the per-diff
// `meta-reviewing-*` checklists included.
describe("the reviewer's preloaded column", () => {
  const preloadedOnReviewer = Object.values(CATALOG.skillsById)
    .filter((skill) =>
      resolveAssignment(skill.id).some(
        (target) => target.agentId === REVIEWER && target.load === "preloaded"
      )
    )
    .map((skill) => skill.id)

  // The table names the rows; targeting decides whether the reviewer is even
  // reached. Compiled, the two must come out as one column.
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

  // The design craft's whole point: reached, and still off the eager column.
  // A row-less reach that preloaded would put a second resident body in every
  // review prompt, which is the outcome the ruling picked lazy to avoid.
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

// The PM's column as a fresh pick actually compiles it, across the whole
// catalog rather than skill by skill: eagerly, the breadth of what the project
// is built with and where it keeps its state; lazily, every depth concern it
// still reaches, because a spec session needs to KNOW the project runs
// Postgres far more often than it needs Postgres's pitfalls in the prompt.
//
// Consolidated, the column is no longer one domain's. The domainless planner
// has no domain to fail the gate on — the reviewer's own shape — so a
// full-stack project's PM opens with the frameworks on both sides of it
// rather than being two agents that each see half.
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

  // The table names the rows; targeting decides whether the PM is even
  // reached. Compiled, the two must come out as one column.
  it("preloads exactly the rows that name the planning flavor", () => {
    const rowsNamingPlanning = Object.entries(PRELOAD_DEFAULTS)
      .filter(([, flavors]) => flavors.includes("planning"))
      .map(([skillId]) => skillId)

    expect([...preloadedOnPm].sort()).toStrictEqual(
      [...rowsNamingPlanning].sort()
    )
  })

  // And read the other way, off the kinds rather than off the table: every
  // domain's frameworks and state kinds, plus the eight ids the AI breadth
  // ruling names, and nothing else.
  it("preloads every domain's breadth kinds and the AI platform", () => {
    expect([...preloadedOnPm].sort()).toStrictEqual(
      [...breadthSkillIds, ...AI_PLATFORM_SKILLS].sort()
    )
  })

  // Two frameworks from opposite sides of a full-stack project. Four PMs ago
  // each was one planner's breadth and the other's blind spot; one planner
  // carries both.
  it("opens with the frameworks of every domain at once", () => {
    for (const skillId of [WEB_SKILL, API_SKILL, MOBILE_SKILL, DESKTOP_SKILL]) {
      expect(preloadedOnPm, skillId).toContain(skillId)
    }
  })

  // The demotion took eagerness, never reach, so the depth a PM used to
  // preload is still on its roster — it just arrives when asked for.
  it("still reaches a demoted depth skill, lazily", () => {
    for (const skillId of [WEB_DEPTH_SKILL, DATABASE_SKILL]) {
      expect(preloadedOnPm, skillId).not.toContain(skillId)
      expect(resolveAssignment(skillId), skillId).toContainEqual({
        agentId: PM,
        load: "lazy",
      })
    }
  })

  // The AI domain's contribution, which the owner's 2026-08-07 ruling is what
  // makes nonzero: the catalog gives AI no framework category, so the
  // thinning's "frameworks and state kinds" would have left it out entirely.
  // The two designated categories also hold what a feature reaches for, so the
  // column is narrower than the kind: a capability skill is reached like any
  // AI skill and arrives when the spec touches it.
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

    // Targeting is by domain plus the two role agents, so every web agent and
    // both of them are still reached; only the load answer follows the
    // fixture's row — and neither role agent's flavor is the one it names.
    expect([...loads.keys()].sort()).toStrictEqual(
      [...agentIdsInDomain("web"), ...CROSS_DOMAIN_ROLE_AGENTS].sort()
    )
    expect(loads.get("web-tester")).toBe("preloaded")
    expect(loads.get("web-developer")).toBe("lazy")
    expect(loads.get(REVIEWER)).toBe("lazy")
    expect(loads.get(PM)).toBe("lazy")
  })
})

// CLI-846. Until the owner's 2026-08-30 ruling the four meta-flavor agents were
// reachable by nothing: `metaSkillReach` admits an agent only when a row names
// its flavor or the skill is one of its craft categories, no row in
// PRELOAD_DEFAULTS named `meta`, and CRAFT_CATEGORIES_BY_FLAVOR had keys for
// `planning` and `reviewer` alone. Four of eighteen agents were outside the
// default system entirely.
//
// The ruling is reading (a): the Admin-tier and Meta-tier skills broadcast to
// the Admin and Meta agents, and the core skills stay domain-scoped.
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

describe("CLI-846: the meta-flavor agents are inside the default system", () => {
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
