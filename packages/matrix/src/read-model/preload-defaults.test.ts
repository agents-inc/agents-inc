import { describe, expect, it, vi } from "vitest"

import { AGENT_DEFINITIONS } from "../generated/agents"
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

// The one place that answers "does this skill arrive preloaded on this agent?".
// Both surfaces read it — the editor's default assignments and the CLI's config
// generator — so a wrong answer here is not a display bug, it is every agent
// compiled from that answer carrying the wrong skill body. These pin the
// contract: what the table may express, what beats what, and what happens when
// an id does not exist.

// Both consumers must be safe to bundle for the browser, so the module may not
// reach the filesystem — at import time or ever. A factory that throws turns any
// such import into a failure instead of a silent Node-only dependency.
vi.mock("node:fs", () => {
  throw new Error("preload-defaults must not import node:fs")
})
vi.mock("node:fs/promises", () => {
  throw new Error("preload-defaults must not import node:fs/promises")
})

const FRAMEWORK_SKILL: SkillId = "web-framework-react"
const TESTING_SKILL: SkillId = "web-testing-vitest"
// Unlisted in the fixture below, not in the shipped table.
const UNLISTED_IN_FIXTURE: SkillId = "web-state-zustand"
// Carried across every implementation domain, so a role row means the same
// thing on every domain's agents — the flavor mechanics without the gate.
const SHARED_SKILL: SkillId = "shared-security-auth-security"
// Reaches agents by authored row alone; the gate lets its rows through.
const META_SKILL: SkillId = "meta-design-expressive-typescript"
// A one-time tsconfig setup rather than most-sessions material, so the shipped
// table names no role for it.
const SETUP_SHARED_SKILL: SkillId = "shared-tooling-typescript-config"
// The review PROCESS — how a review is run — as opposed to what to look for in
// one diff. The only non-framework body the reviewer carries eagerly.
const REVIEW_PROCESS_SKILL: SkillId = "meta-reviewing-reviewing"
// A row both thinnings demoted. What to watch for in one database diff is the
// reviewer's per-diff material; which database the project runs is depth a
// spec reaches for, not the breadth every spec session opens with.
const DATABASE_SKILL: SkillId = "api-database-prisma"
const DATABASE_SKILL_FLAVORS: readonly RoleFlavor[] = [
  "developer",
  "researcher",
]

// A kept planning row of the second breadth kind: where a project keeps its
// state is as much "what this is built with" as the framework around it.
const STATE_SKILL: SkillId = "web-server-state-react-query"
const STATE_SKILL_FLAVORS: readonly RoleFlavor[] = [
  "developer",
  "planning",
  "researcher",
]

// The AI domain's breadth, by the owner's 2026-08-07 ruling: an AI project is
// built on the provider SDK it calls and the orchestration framework it calls
// it through, so those rows carry the planner the way a framework row does.
const AI_PROVIDER_SKILL: SkillId = "ai-provider-anthropic-sdk"
const AI_ORCHESTRATION_SKILL: SkillId = "ai-orchestration-langchain"
const AI_PLATFORM_SKILL_FLAVORS: readonly RoleFlavor[] = [
  "developer",
  "planning",
  "researcher",
]

// The eight rows the ruling names, exactly: five provider SDKs and three
// orchestration frameworks. Pinned by id because the designated-breadth rule
// below admits their two categories but not every skill in them — the
// capability skills sharing `ai-provider` are the reason.
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

// What an AI project may reach for rather than what it is built on: speech,
// vision, transcription. They share a category with the provider SDKs and
// carry no row at all, which is what keeps them off every eager column.
const AI_CAPABILITY_SKILLS: readonly SkillId[] = [
  "ai-provider-claude-vision",
  "ai-provider-elevenlabs",
  "ai-provider-openai-whisper",
]

// The planners' methodology craft. Its row is the researcher's alone, which is
// what keeps the PM's row-less reach — the resolver's business, not this
// table's — a lazy one.
const METHODOLOGY_CRAFT_SKILL: SkillId = "meta-methodology-research-methodology"
const RESEARCHER_IDS = ["ai-researcher", "web-researcher"] as const

// The categories whose skills a session is written IN rather than reaches for,
// which is what earns them the reviewer's prompt. Named rather than matched on
// the id: upstream spells the API frameworks' category `api-api`, so any
// `*-framework` suffix rule would read all five of them as something else.
// `web-docs` is here because the kind it holds was split out of
// `web-meta-framework`, not because a new kind joined the column.
const FRAMEWORK_CATEGORIES = new Set<string>([
  "api-api",
  "cli-framework",
  "desktop-framework",
  "mobile-framework",
  "web-docs",
  "web-framework",
  "web-meta-framework",
])

// The planning column's other half. A PM needs to know WHAT the project is
// built with in most of its sessions, and where the state lives is part of
// that answer; a library's API is depth the spec asks for when it touches it.
// `web-graphql-client` and `web-rpc` are here because the kinds they hold were
// split out of `web-server-state`, not because a new kind joined the column.
const STATE_CATEGORIES = new Set<string>([
  "web-client-state",
  "web-graphql-client",
  "web-rpc",
  "web-server-state",
])

// The AI domain's answer to the two kinds above, by the owner's 2026-08-07
// ruling: the catalog gives AI no framework category at all, and what an AI
// project is built on is the provider SDK it calls plus the orchestration
// framework it calls it through. Designated breadth rather than automatic —
// `ai-provider` also holds the capability skills, which are occasional and
// carry no row — so this widens what a planning row is ALLOWED to sit on
// without demanding one from every member the way the two kinds above do.
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

// The shipped table's own answers for the two entries pinned by name below.
const FRAMEWORK_SKILL_FLAVORS: readonly RoleFlavor[] = [
  "developer",
  "planning",
  "researcher",
  "reviewer",
  "tester",
]
const TESTING_SKILL_FLAVORS: readonly RoleFlavor[] = ["tester"]

const WEB_DEVELOPER: AgentName = "web-developer"
// The two domainless role agents: consolidated, cross-domain by role.
const REVIEWER: AgentName = "reviewer"
const PM: AgentName = "pm"
const WEB_TESTER: AgentName = "web-tester"
const AGENT_SUMMONER: AgentName = "agent-summoner"

// Stands in for the table the data phase authors: one skill preloaded on two
// roles and one on a single role, so a hit, a miss by flavor and a miss by skill
// are all reachable before any real data exists.
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

  // The table is a list of what IS preloaded. If an entry could say "lazy" it
  // would be a second way to express the default, and the two could disagree.
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

  // The curated flag is the author's word — a stack that deliberately keeps a
  // fundamental lazy must survive the table saying otherwise.
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
  // The consolidated `pm` carries the flavor "planning", so anything reading
  // the id would look for a role called "pm" and miss the entry entirely. And
  // being domainless, it takes an implementation domain's planning row as
  // authored — where a tester of another domain misses the same row's flavor.
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

  // The meta agents carry no domain prefix — `agent-summoner` splits to
  // "agent" — so a prefix or suffix reading places them nowhere. A meta skill
  // is what can name them: its rows pass the gate as authored.
  it("resolves a prefix-less meta agent through its meta flavor", () => {
    const metaTable: PreloadDefaults = { [META_SKILL]: ["meta"] }
    const resolveMeta = createLoadStateResolver(metaTable)

    expect(resolveMeta({ skillId: META_SKILL, agentId: AGENT_SUMMONER })).toBe(
      "preloaded"
    )
  })

  // A shared skill has no home domain to be gated to, so the row's word is the
  // whole answer and every domain's agents of that flavor agree.
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

  // A role the CLI adds must not silently become unlistable, and a role it
  // drops must not linger as data nothing can reach.
  it("names exactly the flavors the roster carries", () => {
    const onRoster = new Set<string>(
      Object.values(AGENT_DEFINITIONS).map((agent) => agent.flavor)
    )

    expect([...ROLE_FLAVORS].sort()).toStrictEqual([...onRoster].sort())
  })
})

// The owner's ruling: preload only per the authored mapping AND only on a
// domain match — an api developer is not the same as a web developer, so a
// role-row hit on the wrong domain's agent resolves lazy, not preloaded. The
// two domainless role agents are the deliberate exception: neither has a
// domain to match, so their preloads are exactly the rows their flavor names.
describe("domain affinity gate", () => {
  it("resolves a cross-domain role match to lazy", () => {
    // FIXTURE_DEFAULTS lists the web framework for developer and reviewer;
    // these agents match the row by flavor and miss it by domain.
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

  // A domainless role agent cannot fail a domain match it does not have: any
  // implementation domain's reviewer-flavor row preloads on the reviewer, and
  // the same holds one role over for the planner.
  it("takes a row as authored on either domainless role agent", () => {
    expect(resolve({ skillId: FRAMEWORK_SKILL, agentId: REVIEWER })).toBe(
      "preloaded"
    )
    // A framework row, from a domain the roster fields no implementation
    // agents for at all: both still preload it, because a diff the reviewer
    // reads and a spec the PM writes are alike written in it.
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
    // Shipped row: ["developer"] — preloaded on the flavor it names, lazy on
    // every flavor it does not, the domainless reviewer's included.
    expect(
      resolveLoadState({ skillId: META_SKILL, agentId: WEB_DEVELOPER })
    ).toBe("preloaded")
    expect(resolveLoadState({ skillId: META_SKILL, agentId: REVIEWER })).toBe(
      "lazy"
    )
    expect(resolveLoadState({ skillId: META_SKILL, agentId: WEB_TESTER })).toBe(
      "lazy"
    )
    // Shipped row: ["reviewer"] — the one meta row that still names the
    // reviewer flavor lands on the reviewer as authored.
    expect(
      resolveLoadState({ skillId: REVIEW_PROCESS_SKILL, agentId: REVIEWER })
    ).toBe("preloaded")
  })

  // The explicit tier is the author's word — a curated stack flag or the
  // user's saved config — and the gate only guards the default tier under it.
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
        // A deliberately invalid id: the error path is the thing under test.
        skillId: "no-such-skill" as SkillId,
        agentId: WEB_DEVELOPER,
      })
    ).toThrow(/no-such-skill/)
  })

  it("throws on an agent id that does not exist", () => {
    expect(() =>
      resolve({
        skillId: FRAMEWORK_SKILL,
        // A deliberately invalid id: the error path is the thing under test.
        agentId: "no-such-agent" as AgentName,
      })
    ).toThrow(/no-such-agent/)
  })

  // An explicit flag answers the question without a lookup, which is exactly
  // how a typo in a saved config would slip through unnoticed.
  it("throws on an unknown id even when an explicit flag is given", () => {
    expect(() =>
      resolve({
        // A deliberately invalid id: the error path is the thing under test.
        skillId: "no-such-skill" as SkillId,
        agentId: WEB_DEVELOPER,
        explicit: "preloaded",
      })
    ).toThrow(/no-such-skill/)
  })

  // The roster is generated from the CLI's agent directories, so a role added
  // there arrives here as data. A flavor the table has no way to name must be
  // an error: resolving it to lazy would preload nothing on a whole new role
  // and read exactly like a table that deliberately left it out.
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

// What the shipped table itself must hold, entry by entry: the resolver above
// answers correctly for any table, so these are the only guard on the data.
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

  // An entry listing no roles preloads nothing — a lazy assertion wearing the
  // table's clothes, and the one way the sparse rule could be written around.
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

  // One order, read off ROLE_FLAVORS, so a table diff is a diff about roles
  // rather than about how someone happened to type them.
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

  // Setting a project up is one session, never most of them, so a setup skill
  // in the table would preload a body every later session pays for and no
  // session reads.
  it("holds no entry for a setup skill", () => {
    for (const [skillId] of entries) {
      expect(skillId.includes("-setup-"), skillId).toBe(false)
    }
  })

  // Two entries by name, so a regenerated or bulk-edited table cannot quietly
  // change every agent's prompt while the shape assertions above stay green.
  it("preloads the framework skill on every role that builds with it", () => {
    expect(PRELOAD_DEFAULTS[FRAMEWORK_SKILL]).toStrictEqual(
      FRAMEWORK_SKILL_FLAVORS
    )
  })

  it("preloads a testing skill on the tester alone", () => {
    expect(PRELOAD_DEFAULTS[TESTING_SKILL]).toStrictEqual(TESTING_SKILL_FLAVORS)
  })

  // The reviewer's loading design, pinned at the table: the review PROCESS is
  // every session's material, so it preloads; the domain checklists are
  // per-diff material, so they carry no row at all — lazy by absence, the
  // same thing a missing flag means in an emitted config.
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

  // The planners' loading design, ruled the same way: a playbook is per-spec
  // material the PM loads when the spec touches its artifact classes, so no
  // planning playbook carries a row — lazy by absence on the one PM.
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

  // The rest of the reviewer's column, ruled the same way: the framework a
  // diff is written in is most sessions' material, and so is the review
  // process. What to look for in one diff — a database's pitfalls, a
  // framework-agnostic security list — is not, so it arrives per diff through
  // the lazy `meta-reviewing-*` checklists rather than in every prompt.
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

  // The planning column, ruled the same way and one kind wider: a PM needs to
  // know WHAT the project is built with in most of its spec sessions, so the
  // framework and the state kind are breadth it opens with. A database's
  // pitfalls, a UI library's API — that is depth, and it arrives lazily when
  // the spec touches it rather than in every prompt.
  it("keeps the planning flavor on every framework and state entry", () => {
    for (const [skillId, flavors] of entries) {
      if (!isBreadthSkill(skillId)) continue

      expect(flavors, skillId).toContain("planning")
    }
  })

  // The AI domain is the ruled exception to "framework or state kind": it has
  // neither category, and a spec for an AI project turns on which provider it
  // calls and what orchestrates the call. Those two kinds are designated
  // breadth — a planning row may sit on them — while the demand runs the other
  // way only for the frameworks and state kinds above, because the capability
  // skills share `ai-provider` without sharing its claim on every session.
  it("names the planning flavor nowhere but a framework, a state kind or the AI platform", () => {
    for (const [skillId, flavors] of entries) {
      if (!flavors.includes("planning")) continue

      expect(
        isBreadthSkill(skillId) || isAiPlatformSkill(skillId),
        skillId
      ).toBe(true)
    }
  })

  // The designated categories admit more skills than the ruling names, so the
  // AI rows are pinned by id too: exactly the five provider SDKs and the three
  // orchestration frameworks, and nothing else in the domain.
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

  // Two rows by name, one from each side of the demotion, so a bulk edit
  // cannot hand a column back or take a kept one away while the shape
  // assertions above stay green.
  it("preloads a database skill on the roles that build with it alone", () => {
    expect(PRELOAD_DEFAULTS[DATABASE_SKILL]).toStrictEqual(
      DATABASE_SKILL_FLAVORS
    )
  })

  it("preloads a state skill on the planner as well as the builders", () => {
    expect(PRELOAD_DEFAULTS[STATE_SKILL]).toStrictEqual(STATE_SKILL_FLAVORS)
  })

  // One row from each AI platform kind by name, so the ruling survives a bulk
  // edit that leaves the shape assertions above green.
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

  // Sharing a category with the platform skills is not being one: which speech
  // or vision model a feature reaches for is what a spec asks about when it
  // touches that feature, so these carry no row and land lazily everywhere.
  it("holds no entry for an AI capability skill", () => {
    for (const skillId of AI_CAPABILITY_SKILLS) {
      expect(PRELOAD_DEFAULTS[skillId], skillId).toBeUndefined()

      for (const agentId of [PM, "ai-developer"] as const) {
        expect(resolveLoadState({ skillId, agentId }), skillId).toBe("lazy")
      }
    }
  })

  // The planners' methodology craft loads the way the design craft does one
  // role over: the row names the researcher, so a researcher's copy is
  // resident and the PM's row-less reach arrives lazily.
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

  // Sharing a domain with skills every implementation session reads is not the
  // same as being one: a tsconfig is set up once and edited rarely, so it is
  // absent like any other setup body and every role — the developer and the
  // reviewer a shared entry would land on included — resolves it lazily.
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
