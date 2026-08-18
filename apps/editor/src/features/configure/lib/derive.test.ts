import { MARKETPLACE_CATALOG, MARKETPLACE_REF } from "@workspace/api-mocks"
import {
  CATALOG,
  STACKS,
  SUB_AGENTS_BY_ID,
  SUB_AGENT_GROUPS,
  expandStack,
} from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ConfigureSearch } from "@/routes/search"
import {
  externalSkillId,
  useCatalogStore,
  type ExternalSkill,
} from "@/stores/catalog-store"
import {
  DEFAULT_SKILL_OPTIONS,
  type Assignment,
  type LoadState,
  type SkillEntry,
} from "@/stores/persisted-schema"
import {
  isStackCustom,
  monogramOf,
  selectDomainViews,
  selectInstallInventory,
  selectReachability,
  selectRosterGroups,
  summarize,
  toSkillContents,
  type ConfigSelection,
  type DomainView,
} from "./derive"

// `derive.ts` is where the screen's arithmetic lives, and most of it is
// combinatorial: `isStackCustom` alone has seven independent ways to flip, and
// `selectDomainViews` crosses four filters with two provenances of skill.
// Each of those is one browser round-trip end-to-end and microseconds here, so
// the browser covers that the wiring works and these cover that the sums do.

const SEARCH: ConfigureSearch = {
  domain: null,
  q: "",
  sel: false,
  fromId: "",
}
const search = (over: Partial<ConfigureSearch> = {}): ConfigureSearch => ({
  ...SEARCH,
  ...over,
})

const live = (load: LoadState = "lazy"): Assignment => ({
  load,
  enabled: true,
})
const off = (load: LoadState = "lazy"): Assignment => ({
  load,
  enabled: false,
})

// One record per agent, holding all four of its decisions — the pin, the
// model, the effort, the scope — and any of them may be absent.
const scratch = (
  skills: Record<string, SkillEntry> = {},
  agents: ConfigSelection["agents"] = {}
): ConfigSelection => ({ stackId: null, skills, agents })

// A stack with real assignments, so the "unedited" baseline is not trivially empty.
const STACK = STACKS.find((candidate) => {
  const expansion = expandStack(candidate.id)
  return expansion && expansion.skillIds.length > 2
})!
const EXPANSION = expandStack(STACK.id)!

const asApplied = (): ConfigSelection => ({
  stackId: STACK.id,
  agents: {},
  skills: Object.fromEntries(
    EXPANSION.skillIds.map((skillId) => [
      skillId,
      {
        ...DEFAULT_SKILL_OPTIONS,
        assignments: Object.fromEntries(
          (EXPANSION.assignmentsBySkill[skillId] ?? []).map(
            ({ agentId, load }) => [agentId, live(load)]
          )
        ),
      } satisfies SkillEntry,
    ])
  ),
})

// A stack member that definitely carries assignments, so the load-state and
// row-off tests below can never silently sample an agentless skill.
const FIRST_SKILL = EXPANSION.skillIds.find(
  (id) => (EXPANSION.assignmentsBySkill[id] ?? []).length > 0
)!

const edit = (patch: Partial<SkillEntry>): ConfigSelection => {
  const applied = asApplied()
  return {
    ...applied,
    skills: {
      ...applied.skills,
      [FIRST_SKILL]: { ...applied.skills[FIRST_SKILL]!, ...patch },
    },
  }
}

describe("monogramOf", () => {
  it.each([
    ["React", "RE"],
    ["CSS Modules", "CM"],
    ["class-variance-authority", "CV"],
    ["Next.js", "NJ"],
    ["Zod", "ZO"],
  ])("reduces %s to %s", (name, expected) => {
    expect(monogramOf(name)).toBe(expected)
  })
})

describe("isStackCustom", () => {
  it("is false for a stack exactly as applied", () => {
    expect(isStackCustom(asApplied())).toBe(false)
  })

  it("is false for scratch with nothing selected", () => {
    expect(isStackCustom(scratch())).toBe(false)
  })

  it("is true for scratch once anything is selected", () => {
    expect(
      isStackCustom(
        scratch({
          [FIRST_SKILL]: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
        })
      )
    ).toBe(true)
  })

  // Every one of these is an edit the user would be upset to lose, which is
  // what the stack-switch confirm keys off. Comparing only the skill *set*
  // would silently discard the other six.
  it.each([
    ["install mode", { install: "eject" as const }],
    ["scope", { scope: "project" as const }],
  ])("is true after changing %s", (_label, patch) => {
    expect(isStackCustom(edit(patch))).toBe(true)
  })

  it("is true after removing a skill the stack included", () => {
    const applied = asApplied()
    const { [FIRST_SKILL]: _dropped, ...rest } = applied.skills
    expect(isStackCustom({ ...applied, skills: rest })).toBe(true)
  })

  it("is true after unassigning a sub-agent", () => {
    expect(isStackCustom(edit({ assignments: {} }))).toBe(true)
  })

  it("is true after changing only a load state", () => {
    const applied = asApplied()
    const current = applied.skills[FIRST_SKILL]!
    const [agentId, assignment] = Object.entries(current.assignments)[0] ?? []
    if (!agentId || !assignment)
      throw new Error("sampled skill has no assignments")

    expect(
      isStackCustom(
        edit({
          assignments: {
            ...current.assignments,
            [agentId]: live(
              assignment.load === "preloaded" ? "lazy" : "preloaded"
            ),
          },
        })
      )
    ).toBe(true)
  })

  it("is true after switching one roster row off", () => {
    const applied = asApplied()
    const current = applied.skills[FIRST_SKILL]!
    const [agentId, assignment] = Object.entries(current.assignments)[0] ?? []
    if (!agentId || !assignment)
      throw new Error("sampled skill has no assignments")

    expect(
      isStackCustom(
        edit({
          assignments: {
            ...current.assignments,
            [agentId]: { ...assignment, enabled: false },
          },
        })
      )
    ).toBe(true)
  })

  // `applyStack` writes no agent records at all, so any entry in that map is an
  // edit — a pin in either direction, and equally a model or an effort, which
  // are now decisions the same map holds.
  it.each([
    ["pinned off", { on: false }],
    ["pinned on", { on: true }],
    ["given a model", { model: "haiku" }],
    ["given an effort", { effort: "max" }],
  ] as const)("is true once an agent is %s", (_label, choice) => {
    expect(
      isStackCustom({ ...asApplied(), agents: { "web-tester": choice } })
    ).toBe(true)
    expect(isStackCustom(scratch({}, { "web-tester": choice }))).toBe(true)
  })

  it("is true when the stack itself no longer exists", () => {
    expect(
      isStackCustom({ stackId: "deleted-stack", skills: {}, agents: {} })
    ).toBe(true)
  })
})

describe("summarize", () => {
  it("counts nothing for an empty configuration", () => {
    expect(summarize(scratch())).toEqual({
      skillCount: 0,
      agentCount: 0,
      assignmentCount: 0,
      preloadedCount: 0,
      ejectedCount: 0,
    })
  })

  it("counts each sub-agent once across skills, and assignments every time", () => {
    const config = scratch({
      a: {
        ...DEFAULT_SKILL_OPTIONS,
        assignments: {
          "web-developer": live("preloaded"),
          reviewer: live(),
        },
      },
      b: { ...DEFAULT_SKILL_OPTIONS, assignments: { "web-developer": live() } },
    })

    expect(summarize(config)).toMatchObject({
      skillCount: 2,
      agentCount: 2,
      assignmentCount: 3,
      preloadedCount: 1,
    })
  })

  // A row the roster switched off must not install, so it must not count.
  it("ignores disabled assignments everywhere", () => {
    const config = scratch({
      a: {
        ...DEFAULT_SKILL_OPTIONS,
        assignments: {
          "web-developer": live("preloaded"),
          reviewer: off("preloaded"),
        },
      },
    })

    expect(summarize(config)).toMatchObject({
      agentCount: 1,
      assignmentCount: 1,
      preloadedCount: 1,
    })
  })

  it("counts a pinned-on agent with no skills as a base agent", () => {
    expect(
      summarize(scratch({}, { "web-developer": { on: true } })).agentCount
    ).toBe(1)
  })

  it("does not count assignments on a pinned-off agent", () => {
    const config = scratch(
      {
        a: {
          ...DEFAULT_SKILL_OPTIONS,
          assignments: { "web-developer": live() },
        },
      },
      { "web-developer": { on: false } }
    )

    expect(summarize(config)).toMatchObject({
      agentCount: 0,
      assignmentCount: 0,
    })
  })

  it("counts ejected skills rather than ejected assignments", () => {
    const config = scratch({
      a: {
        ...DEFAULT_SKILL_OPTIONS,
        install: "eject",
        assignments: { "web-developer": live(), reviewer: live() },
      },
      b: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
    })

    expect(summarize(config).ejectedCount).toBe(1)
  })
})

describe("selectRosterGroups", () => {
  const allRows = (config: ConfigSelection) =>
    selectRosterGroups(config).flatMap((group) => group.agents)

  it("lists every sub-agent that exists, on or off", () => {
    const rows = allRows(scratch())

    expect(rows).toHaveLength(
      SUB_AGENT_GROUPS.flatMap((group) => group.agents).length
    )
    expect(rows.every((row) => !row.on)).toBe(true)
  })

  it("derives on from holding an enabled skill", () => {
    const rows = allRows(
      scratch({
        a: {
          ...DEFAULT_SKILL_OPTIONS,
          assignments: { "web-developer": live(), reviewer: off() },
        },
      })
    )

    expect(rows.find((row) => row.agent.id === "web-developer")?.on).toBe(true)
    // A disabled row keeps the skill listed but does not switch the agent on.
    const reviewer = rows.find((row) => row.agent.id === "reviewer")!
    expect(reviewer.on).toBe(false)
    expect(reviewer.skills.map((skill) => skill.id)).toEqual(["a"])
    expect(reviewer.skills[0]!.enabled).toBe(false)
  })

  it("lets a pin override the derived state in both directions", () => {
    const rows = allRows(
      scratch(
        {
          a: {
            ...DEFAULT_SKILL_OPTIONS,
            assignments: { "web-developer": live() },
          },
        },
        { "web-developer": { on: false }, "web-tester": { on: true } }
      )
    )

    expect(rows.find((row) => row.agent.id === "web-developer")?.on).toBe(false)
    expect(rows.find((row) => row.agent.id === "web-tester")?.on).toBe(true)
  })

  it("counts only on agents in the domain badge", () => {
    const groups = selectRosterGroups(
      scratch({
        a: {
          ...DEFAULT_SKILL_OPTIONS,
          assignments: { "web-developer": live(), "web-tester": live() },
        },
      })
    )
    const web = groups.find((group) => group.domainId === "web")!

    expect(web.onCount).toBe(2)
    expect(web.agents.length).toBeGreaterThan(2)
  })

  // The consolidated reviewer has no domain prefix, so it counts in the meta
  // group's badge — not in the domain whose skill it happens to carry.
  it("counts the reviewer in the meta badge", () => {
    const groups = selectRosterGroups(
      scratch({
        a: {
          ...DEFAULT_SKILL_OPTIONS,
          assignments: { "web-developer": live(), reviewer: live() },
        },
      })
    )

    expect(groups.find((group) => group.domainId === "web")!.onCount).toBe(1)
    expect(groups.find((group) => group.domainId === "meta")!.onCount).toBe(1)
  })

  it("lists where-used only across on agents carrying the skill live", () => {
    const rows = allRows(
      scratch(
        {
          a: {
            ...DEFAULT_SKILL_OPTIONS,
            assignments: {
              "web-developer": live(),
              reviewer: live(),
              // Disabled — must not appear as a use.
              "web-tester": off(),
              // Live, but the agent is pinned off — must not appear either.
              "api-developer": live(),
            },
          },
        },
        { "api-developer": { on: false } }
      )
    )

    const usedBy = rows
      .find((row) => row.agent.id === "web-developer")!
      .skills[0]!.usedBy.map((agent) => agent.id)

    expect(usedBy).toEqual(["web-developer", "reviewer"])
  })
})

// The roster row is where a model, an effort and a scope become visible, and
// the store holds only explicit choices — so resolving the resting value is a
// derivation, not a default written into state.
describe("roster model, effort and scope", () => {
  const rowFor = (config: ConfigSelection, agentId: string) =>
    selectRosterGroups(config)
      .flatMap((group) => group.agents)
      .find((row) => row.agent.id === agentId)!

  const WEB_DEVELOPER_MODEL = SUB_AGENTS_BY_ID["web-developer"]!.model

  // There is no single default for the model: an agent rests on the one its own
  // metadata names, and only falls back to sonnet when it names none. Scope is
  // the opposite — the catalogue says nothing about it, so every agent rests on
  // the shared selection default of writing front-matter into ~/.claude.
  it("rests every agent on its catalogue model, medium effort and global", () => {
    const rows = selectRosterGroups(scratch()).flatMap((group) => group.agents)

    for (const row of rows) {
      expect(row.model).toBe(SUB_AGENTS_BY_ID[row.agent.id]?.model ?? "sonnet")
      expect(row.effort).toBe("medium")
      expect(row.scope).toBe("global")
    }
  })

  it("prefers an explicit choice over the resting value", () => {
    const row = rowFor(
      scratch(
        {},
        { "web-developer": { model: "haiku", effort: "max", scope: "project" } }
      ),
      "web-developer"
    )

    expect(row.model).toBe("haiku")
    expect(row.effort).toBe("max")
    expect(row.scope).toBe("project")
  })

  // The record is sparse per field, not per agent: choosing an effort must not
  // drag the model or the scope off their resting values.
  it("falls back field by field", () => {
    const row = rowFor(
      scratch({}, { "web-developer": { effort: "low" } }),
      "web-developer"
    )

    expect(row.model).toBe(WEB_DEVELOPER_MODEL)
    expect(row.effort).toBe("low")
    expect(row.scope).toBe("global")
  })

  // Choosing a model is not the same as asking for the agent.
  it("does not switch an agent on for carrying a choice", () => {
    expect(
      rowFor(
        scratch({}, { "web-developer": { model: "haiku" } }),
        "web-developer"
      ).on
    ).toBe(false)
  })

  // A pinned-off agent keeps both controls, recessed — so it keeps both values.
  it("resolves them for a pinned-off agent too", () => {
    const row = rowFor(
      scratch(
        {
          a: {
            ...DEFAULT_SKILL_OPTIONS,
            assignments: { "web-developer": live() },
          },
        },
        { "web-developer": { on: false, effort: "xhigh" } }
      ),
      "web-developer"
    )

    expect(row.on).toBe(false)
    expect(row.model).toBe(WEB_DEVELOPER_MODEL)
    expect(row.effort).toBe("xhigh")
  })
})

describe("selectInstallInventory", () => {
  const config = scratch({
    [FIRST_SKILL]: {
      ...DEFAULT_SKILL_OPTIONS,
      scope: "project",
      assignments: {},
    },
    [EXPANSION.skillIds[1]!]: {
      ...DEFAULT_SKILL_OPTIONS,
      assignments: {},
    },
  })

  it("splits skills by scope", () => {
    const inventory = selectInstallInventory(config)

    expect(inventory.project.map((skill) => skill.id)).toEqual([FIRST_SKILL])
    expect(inventory.global.map((skill) => skill.id)).toEqual([
      EXPANSION.skillIds[1],
    ])
  })

  // Insertion order would reshuffle the pane as skills are toggled.
  it("orders agents by the catalog, not by which skill referenced them first", () => {
    const applied = asApplied()
    const forward = selectInstallInventory(applied)
    const reversed = selectInstallInventory({
      ...applied,
      skills: Object.fromEntries(Object.entries(applied.skills).reverse()),
    })

    expect(forward.agents.map(({ agent }) => agent.id)).toEqual(
      reversed.agents.map(({ agent }) => agent.id)
    )
  })

  it("includes a pinned bare agent, marked base-only", () => {
    const inventory = selectInstallInventory(
      scratch({}, { "web-developer": { on: true } })
    )

    expect(inventory.agents).toHaveLength(1)
    expect(inventory.agents[0]!.agent.id).toBe("web-developer")
    expect(inventory.agents[0]!.baseOnly).toBe(true)
  })

  // The pane splits the agents by scope exactly as it splits the skills, so
  // every agent has to carry where its front-matter lands — resolved, since
  // the store holds only the agents that were moved off the resting scope.
  it("carries each agent's resolved scope", () => {
    const inventory = selectInstallInventory(
      scratch(
        {},
        {
          "web-developer": { on: true, scope: "project" },
          reviewer: { on: true },
        }
      )
    )

    expect(
      Object.fromEntries(
        inventory.agents.map(({ agent, scope }) => [agent.id, scope])
      )
    ).toEqual({ "web-developer": "project", reviewer: "global" })
  })

  it("excludes a pinned-off agent even when skills point at it", () => {
    const inventory = selectInstallInventory(
      scratch(
        {
          a: {
            ...DEFAULT_SKILL_OPTIONS,
            assignments: { "web-developer": live() },
          },
        },
        { "web-developer": { on: false } }
      )
    )

    expect(inventory.agents).toEqual([])
  })
})

describe("selectDomainViews", () => {
  const selected = scratch({
    [FIRST_SKILL]: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
  })
  const empty = scratch()

  const allCells = (config: ConfigSelection, over?: Partial<ConfigureSearch>) =>
    selectDomainViews(config, search(over)).flatMap((domain) =>
      domain.categories.flatMap((category) => category.cells)
    )

  it("renders every domain when nothing is filtered", () => {
    expect(selectDomainViews(empty, SEARCH).length).toBe(CATALOG.domains.length)
  })

  it("narrows to one domain", () => {
    const views = selectDomainViews(empty, search({ domain: "web" }))

    expect(views).toHaveLength(1)
    expect(views[0]!.id).toBe("web")
  })

  it("matches a query against name, slug and description", () => {
    const skill = CATALOG.skillsById[FIRST_SKILL]!
    const ids = allCells(empty, { q: skill.displayName }).map(
      (cell) => cell.skill.id
    )

    expect(ids).toContain(FIRST_SKILL)
  })

  it("drops categories and domains that filter down to nothing", () => {
    const views = selectDomainViews(empty, search({ q: "zzzznotaskill" }))
    expect(views).toEqual([])
  })

  it("keeps only selected skills when asked", () => {
    const cells = allCells(selected, { sel: true })

    expect(cells.map((cell) => cell.skill.id)).toEqual([FIRST_SKILL])
    expect(cells.every((cell) => cell.selected)).toBe(true)
  })

  it("shows nothing selected as nothing at all", () => {
    expect(allCells(empty, { sel: true })).toEqual([])
  })

  it("derives the agent count from live assignments only", () => {
    const config = scratch({
      [FIRST_SKILL]: {
        ...DEFAULT_SKILL_OPTIONS,
        assignments: {
          "web-developer": live(),
          reviewer: live("preloaded"),
          "web-tester": off(),
        },
      },
    })

    const cell = allCells(config, { sel: true })[0]!
    expect(cell.agentCount).toBe(2)
  })
})

// Incompatibility is the one derivation that reads the whole catalogue at
// once, and the interesting cases are all several hops from the thing the user
// clicked — exactly the shape that is unreadable end-to-end and cheap here.
describe("selectReachability", () => {
  const REACT = "web-framework-react"
  const SVELTE = "web-framework-svelte"
  const SVELTEKIT = "web-meta-framework-sveltekit"
  const NUXT = "web-meta-framework-nuxt"
  const VUE = "web-framework-vue-composition-api"
  const PINIA = "web-state-pinia"
  const NEXTJS = "web-meta-framework-nextjs"
  const ANGULAR = "web-framework-angular-standalone"
  const NGRX = "web-state-ngrx-signalstore"

  const ruledOutBy = (...selected: string[]) =>
    selectReachability(new Set(selected)).outOfReach

  it("rules out nothing while nothing is selected", () => {
    expect(ruledOutBy().size).toBe(0)
  })

  it("rules out the skills a selection directly conflicts with", () => {
    expect(ruledOutBy(REACT).has(SVELTE)).toBe(true)
  })

  // The case `requires` exists for: nothing links React to SvelteKit
  // directly — `conflictsWith` never leaves its own category. It is
  // SvelteKit → requires Svelte → conflicts with React.
  it("follows a requirement onto the skill built on it", () => {
    expect(ruledOutBy(REACT).has(SVELTEKIT)).toBe(true)
  })

  it("keeps following after the first hop", () => {
    const out = ruledOutBy(REACT)

    // Pinia needs Vue or Nuxt; Nuxt needs Vue; Vue conflicts with React.
    expect(out.has(VUE)).toBe(true)
    expect(out.has(NUXT)).toBe(true)
    expect(out.has(PINIA)).toBe(true)
  })

  it("leaves a skill whose requirement the selection satisfies", () => {
    // Next.js is built on React, so choosing React is what enables it.
    expect(ruledOutBy(REACT).has(NEXTJS)).toBe(false)
  })

  it("never rules out what is selected", () => {
    const out = ruledOutBy(REACT, SVELTE)
    expect(out.has(REACT)).toBe(false)
    expect(out.has(SVELTE)).toBe(false)
  })

  // The other direction, and the one the rule missed at first: Next.js is
  // built on React, so choosing it chooses React — and everything React
  // conflicts with has to go, even though Next.js names none of them.
  describe("what the selection implies", () => {
    it("counts an implied skill as reached", () => {
      expect([...selectReachability(new Set([NEXTJS])).reached]).toContain(
        REACT
      )
    })

    it("rules out what the implied skill conflicts with", () => {
      const out = ruledOutBy(NEXTJS)

      expect(out.has(ANGULAR)).toBe(true)
      expect(out.has(VUE)).toBe(true)
      expect(out.has(SVELTE)).toBe(true)
    })

    it("carries on through the implied skill's own tail", () => {
      const out = ruledOutBy(NEXTJS)

      expect(out.has(NUXT)).toBe(true) // needs Vue
      expect(out.has(PINIA)).toBe(true) // needs Vue or Nuxt
      expect(out.has(NGRX)).toBe(true) // needs Angular
    })

    // "Pinia needs Vue *or* Nuxt" cannot name which, so selecting Pinia must
    // not silently commit the user to either.
    it("implies nothing from an ambiguous requirement", () => {
      const { reached } = selectReachability(new Set([PINIA]))

      expect(reached.has(VUE)).toBe(false)
      expect(reached.has(NUXT)).toBe(false)
    })

    it("implies every member of an all-of requirement", () => {
      // shadcn/ui needs Tailwind outright, plus one of the React frameworks —
      // the second group is ambiguous, so only Tailwind is implied.
      const { reached } = selectReachability(new Set(["web-ui-shadcn-ui"]))

      expect(reached.has("web-styling-tailwind")).toBe(true)
      expect(reached.has(REACT)).toBe(false)
    })
  })
})

describe("incompatible cells", () => {
  const cellFor = (config: ConfigSelection, skillId: string) =>
    selectDomainViews(config, SEARCH)
      .flatMap((domain) => domain.categories.flatMap((c) => c.cells))
      .find((cell) => cell.skill.id === skillId)

  const withReact = scratch({
    "web-framework-react": { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
  })

  it("marks an unreachable skill incompatible, with the reason", () => {
    const cell = cellFor(withReact, "web-meta-framework-sveltekit")!

    expect(cell.incompatible).toBe(true)
    expect(cell.incompatibleReason).toBe("Needs Svelte")
  })

  it("names every candidate when any one of them would do", () => {
    const cell = cellFor(withReact, "web-state-pinia")!

    expect(cell.incompatible).toBe(true)
    expect(cell.incompatibleReason).toMatch(/^Needs one of /)
    expect(cell.incompatibleReason).toContain("Vue")
    expect(cell.incompatibleReason).toContain("Nuxt")
  })

  // Picking one of these replaces rather than adds, so disabling the rest
  // would strand the user on their first choice with no way back.
  it("leaves exclusive siblings selectable", () => {
    for (const sibling of [
      "web-framework-vue-composition-api",
      "web-framework-svelte",
    ]) {
      expect(cellFor(withReact, sibling)!.incompatible).toBe(false)
    }
  })

  // A verdict is about possibility, never presence: Expo needs React Native,
  // which React rules out of nothing, so the cell stays live even though the
  // host it needs is unselected. The `compatibleWith` whitelist said otherwise
  // until the owner's 2026-08-07 ruling deleted it (CLI-389 phase C).
  it("leaves a skill selectable while the host it needs is merely unselected", () => {
    const expo = cellFor(withReact, "mobile-framework-expo")!

    expect(expo.incompatible).toBe(false)
    expect(expo.incompatibleReason).toBeUndefined()
  })

  // Both are meta-frameworks, so swapping really is the way between them.
  it("still leaves the implier's own siblings swappable", () => {
    const withNextjs = scratch({
      "web-meta-framework-nextjs": {
        ...DEFAULT_SKILL_OPTIONS,
        assignments: {},
      },
    })

    expect(cellFor(withNextjs, "web-meta-framework-remix")!.incompatible).toBe(
      false
    )
  })

  // Its requirement is unsatisfiable whichever sibling you swap to, so the
  // sibling exemption must not rescue it.
  it("disables a sibling whose own requirement is out of reach", () => {
    const config = scratch({
      "web-framework-react": { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
      "web-meta-framework-nextjs": {
        ...DEFAULT_SKILL_OPTIONS,
        assignments: {},
      },
    })

    expect(cellFor(config, "web-meta-framework-sveltekit")!.incompatible).toBe(
      true
    )
  })

  it("never marks a selected skill incompatible", () => {
    expect(cellFor(withReact, "web-framework-react")!.incompatible).toBe(false)
  })

  it("marks nothing while nothing is selected", () => {
    const cells = selectDomainViews(scratch(), SEARCH).flatMap((domain) =>
      domain.categories.flatMap((c) => c.cells)
    )

    expect(cells.some((cell) => cell.incompatible)).toBe(false)
  })
})

// An added skill is a real catalogue entry now, so nothing in this file has a
// second code path for one: it is placed by the category it was given, filtered
// by the same filters, listed by the same lists and named by the same lookup.
// These say so — the tests EDITOR-15 to EDITOR-20 each described a way the
// second path went wrong, and there is no second path left to go wrong.
describe("derivations over an external skill", () => {
  const HOST = CATALOG.skillsById["web-framework-react"]!
  const CATEGORY = HOST.categoryId
  const DOMAIN = HOST.domainId
  const HOUSE_ID = externalSkillId(CATEGORY, "House React")

  const house: ExternalSkill = {
    id: HOUSE_ID,
    displayName: "House React",
    description: "The house React skill.",
    categoryId: CATEGORY,
    repo: "acme/skills",
    path: "skills/house-react",
    files: { "SKILL.md": "# House React\n" },
  }

  const picked = () =>
    scratch({
      [HOUSE_ID]: {
        install: "eject",
        scope: "project",
        assignments: { "web-developer": live() },
      },
    })

  beforeEach(() => {
    useCatalogStore.getState().addExternal([house])
  })

  afterEach(() => {
    useCatalogStore.getState().reset()
  })

  const cellsIn = (view: DomainView, categoryId: string) =>
    view.categories.find((category) => category.id === categoryId)?.cells ?? []

  // EDITOR-17: it lands beside the skills it belongs with. There is no Added
  // section and no Uncategorized category, because the dropdown made the
  // placement a decision rather than a guess `categoriseRepo` had to make.
  it("renders in the category it was filed under", () => {
    const views = selectDomainViews(scratch(), SEARCH)
    const domain = views.find((view) => view.id === DOMAIN)!

    expect(cellsIn(domain, CATEGORY).map((cell) => cell.skill.id)).toContain(
      HOUSE_ID
    )
    expect(views.some((view) => view.id === "added")).toBe(false)
  })

  it("still marks its provenance, so the cell can draw the added tag", () => {
    const domain = selectDomainViews(scratch(), SEARCH).find(
      (view) => view.id === DOMAIN
    )!
    const cell = cellsIn(domain, CATEGORY).find(
      (candidate) => candidate.skill.id === HOUSE_ID
    )!

    expect(cell.skill.added).toBe(true)
    expect(cell.skill.sourceUrl).toContain("acme/skills")
  })

  // EDITOR-19: the chip filters domains, and this skill now has one. It used to
  // sit outside every domain, so any chip at all erased it — selected or not.
  it("survives its own domain's filter chip", () => {
    const views = selectDomainViews(picked(), search({ domain: DOMAIN }))
    const domain = views.find((view) => view.id === DOMAIN)!

    expect(cellsIn(domain, CATEGORY).map((cell) => cell.skill.id)).toContain(
      HOUSE_ID
    )
  })

  it("is filtered out by another domain's chip, exactly as its neighbours are", () => {
    const views = selectDomainViews(picked(), search({ domain: "api" }))

    expect(
      views.flatMap((view) => view.categories.flatMap((c) => c.cells))
    ).not.toContainEqual(expect.objectContaining({ skill: { id: HOUSE_ID } }))
  })

  it("answers the search box like any other skill", () => {
    const views = selectDomainViews(scratch(), search({ q: "house react" }))
    const cells = views.flatMap((view) =>
      view.categories.flatMap((category) => category.cells)
    )

    expect(cells.map((cell) => cell.skill.id)).toStrictEqual([HOUSE_ID])
  })

  // EDITOR-15, in the roster and the install pane: the name comes off the
  // catalogue now, so no consumer needs a second list passed alongside.
  it("is named by the roster without being handed a second list", () => {
    const rows = selectRosterGroups(picked())
      .flatMap((group) => group.agents)
      .flatMap((agent) => agent.skills)

    expect(rows.map((row) => row.displayName)).toContain("House React")
  })

  it("is listed in the install inventory under its own name", () => {
    const inventory = selectInstallInventory(picked())

    expect(inventory.project.map((skill) => skill.displayName)).toStrictEqual([
      "House React",
    ])
  })

  // EDITOR-32: the install pane is the second way into the contents preview, so
  // the row has to know which of its skills has one to offer. The same
  // provenance flag `GridSkill.added` carries for the cell's tag — a marker, not
  // a branch in any derivation.
  it("is marked in the install inventory as one whose contents can be read", () => {
    const inventory = selectInstallInventory(picked())

    expect(inventory.project[0]?.added).toBe(true)
  })
})

// ── Contents ─────────────────────────────────────────────────────────────
//
// EDITOR-32, and a REQUIREMENT of the EDITOR-03 inline-content ruling rather
// than a nicety: a shared link carries a stranger's files, which the CLI writes
// to somebody's disk, so being able to READ them before installing is what
// makes carrying them acceptable. The bytes are already seated by then —
// `adoptSeedPayload` seats a payload's `external` map before anything renders —
// so this is a rendering surface over the seat, never a fetch.
describe("an external skill's contents", () => {
  const CATEGORY = CATALOG.skillsById["web-framework-react"]!.categoryId

  // Deliberately NOT in reading order, and SKILL.md deliberately not first: the
  // order is the fetch's, which is the tree listing's, which is GitHub's.
  const SPRAWLING: ExternalSkill = {
    id: externalSkillId(CATEGORY, "Sprawling"),
    displayName: "Sprawling",
    description: "A skill of many files.",
    categoryId: CATEGORY,
    repo: "acme/skills",
    path: "skills/sprawling",
    files: {
      "reference/prompts.md": "# Prompts\n",
      "metadata.yaml": "slug: sprawling\n",
      "SKILL.md": "---\nname: sprawling\n---\n\nThe body.\n",
      "examples-core.md": "# Examples\n",
      "scripts/run.sh": "#!/bin/sh\necho hi\n",
    },
  }

  const paths = () => toSkillContents(SPRAWLING).files.map((file) => file.path)

  // SKILL.md is what the skill IS — the file Claude Code reads to learn one
  // exists — so it is what a reader is deciding whether to trust, and it opens
  // without being asked for. First in the list rather than named in a second
  // field, so the order and the opening file cannot disagree.
  it("opens on SKILL.md however the directory listed it", () => {
    expect(paths()[0]).toBe("SKILL.md")
  })

  // The whole directory, per the same ruling that made the payload carry it:
  // `scripts/` and `reference/` are where a third-party skill keeps everything
  // a reader would actually want to look at before installing it.
  it("lists every file in the directory, not the manifest alone", () => {
    expect(paths()).toHaveLength(Object.keys(SPRAWLING.files).length)
  })

  it("orders the rest by path, so a tree does not reshuffle between opens", () => {
    expect(paths().slice(1)).toStrictEqual([
      "examples-core.md",
      "metadata.yaml",
      "reference/prompts.md",
      "scripts/run.sh",
    ])
  })

  // Verbatim, byte for byte. What is on screen has to be what the CLI would
  // write, or the preview is reassuring the reader about a different file.
  it("carries each file's text exactly as it was fetched", () => {
    const manifest = toSkillContents(SPRAWLING).files[0]

    expect(manifest?.text).toBe(SPRAWLING.files["SKILL.md"])
  })

  // A reader deciding whether to trust content wants to know whose it is. The
  // whole coordinate — owner, repository and the directory within it — because
  // one repository holds many skills and the owner is the informative half.
  it("names the coordinate the bytes were read from", () => {
    expect(toSkillContents(SPRAWLING).coordinate).toBe(
      "acme/skills/skills/sprawling"
    )
  })

  it("names the skill, so a reader knows which one they opened", () => {
    expect(toSkillContents(SPRAWLING).displayName).toBe("Sprawling")
  })
})

// ── Source links ─────────────────────────────────────────────────────────
//
// EDITOR-44. A cell's `Source code` link is the only address on the screen that
// leaves it, and it used to be built from a hardcoded `agents-inc/skills` — so
// on any loaded marketplace every one of its skills linked to a repository that
// does not hold them. Checked against live GitHub on a custom marketplace: 404.
//
// The SEATED marketplace is what answers, because the grid draws the seated
// catalogue: these are ITS skills, and a shared address that seated one without
// this browser ever choosing it (EDITOR-37) still has to link to where the
// skills on screen actually live.

describe("a catalogue skill's source link", () => {
  const ACME_SKILL = "acme-web-widgets"

  afterEach(() => {
    useCatalogStore.getState().reset()
  })

  const linkTo = (skillId: string) =>
    selectDomainViews(scratch(), SEARCH)
      .flatMap((view) => view.categories)
      .flatMap((category) => category.cells)
      .find((cell) => cell.skill.id === skillId)?.skill.sourceUrl

  const seat = (marketplace: string) =>
    useCatalogStore.getState().load(MARKETPLACE_CATALOG, marketplace)

  it("addresses the public repository while nothing else is seated", () => {
    expect(linkTo("web-framework-react")).toBe(
      "https://github.com/agents-inc/skills/tree/HEAD/src/skills/web-framework-react"
    )
  })

  it("addresses the seated marketplace's repository, never the public one", () => {
    seat(MARKETPLACE_REF)

    expect(linkTo(ACME_SKILL)).toBe(
      `https://github.com/${MARKETPLACE_REF}/tree/HEAD/src/skills/${ACME_SKILL}`
    )
  })

  // Whatever was typed reaches the seat verbatim — the field takes a pasted
  // browser URL and the CLI's own `github:` prefix — so the address has to be
  // read out of it rather than pasted into a template.
  it("reads a marketplace pasted as a browser URL down to its repository", () => {
    seat("https://github.com/acme/skills")

    expect(linkTo(ACME_SKILL)).toBe(
      `https://github.com/acme/skills/tree/HEAD/src/skills/${ACME_SKILL}`
    )
  })

  it("reads a marketplace named with the CLI's github: prefix", () => {
    seat("github:acme/skills")

    expect(linkTo(ACME_SKILL)).toBe(
      `https://github.com/acme/skills/tree/HEAD/src/skills/${ACME_SKILL}`
    )
  })

  // The catalogue came off that ref, so its skills are the ones on that ref.
  // `HEAD` would be a different branch's answer to the same question.
  it("follows the ref the marketplace was named with", () => {
    seat("acme/skills#beta")

    expect(linkTo(ACME_SKILL)).toBe(
      `https://github.com/acme/skills/tree/beta/src/skills/${ACME_SKILL}`
    )
  })

  // An added skill answers to no marketplace at all, so a swap must not move
  // its address: it is in the repository the index read it from.
  it("leaves an added skill pointing at the repository it came from", () => {
    const HOST = CATALOG.skillsById["web-framework-react"]!
    const outsider: ExternalSkill = {
      id: externalSkillId(HOST.categoryId, "Outsider"),
      displayName: "Outsider",
      description: "From somewhere else entirely.",
      categoryId: HOST.categoryId,
      repo: "obra/superpowers",
      path: "skills/outsider",
      files: { "SKILL.md": "# Outsider\n" },
    }
    useCatalogStore.getState().addExternal([outsider])

    expect(linkTo(outsider.id)).toBe(
      "https://github.com/obra/superpowers/tree/HEAD/skills/outsider"
    )
  })
})
