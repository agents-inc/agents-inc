import {
  CATALOG,
  STACKS,
  SUB_AGENTS_BY_ID,
  SUB_AGENT_GROUPS,
  expandStack,
} from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import type { ConfigureSearch } from "@/routes/search"
import type { AddedSkill } from "@/stores/added-skills-store"
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
  type ConfigSelection,
} from "./derive"

// `derive.ts` is where the screen's arithmetic lives, and most of it is
// combinatorial: `isStackCustom` alone has seven independent ways to flip, and
// `selectDomainViews` crosses four filters with two provenances of skill.
// Each of those is one browser round-trip end-to-end and microseconds here, so
// the browser covers that the wiring works and these cover that the sums do.

const SEARCH: ConfigureSearch = {
  domain: null,
  q: "",
  rec: false,
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

const asApplied = (): ConfigSelection => {
  const preloaded = new Set<string>(EXPANSION.preloadedSkillIds)
  return {
    stackId: STACK.id,
    agents: {},
    skills: Object.fromEntries(
      EXPANSION.skillIds.map((skillId) => [
        skillId,
        {
          ...DEFAULT_SKILL_OPTIONS,
          assignments: Object.fromEntries(
            (EXPANSION.agentsBySkill[skillId] ?? []).map((agentId) => [
              agentId,
              live(preloaded.has(skillId) ? "preloaded" : "lazy"),
            ])
          ),
        } satisfies SkillEntry,
      ])
    ),
  }
}

// A stack member that definitely carries assignments, so the load-state and
// row-off tests below can never silently sample an agentless skill.
const FIRST_SKILL = EXPANSION.skillIds.find(
  (id) => (EXPANSION.agentsBySkill[id] ?? []).length > 0
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
    ["scope", { scope: "global" as const }],
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
          "web-reviewer": live(),
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
          "web-reviewer": off("preloaded"),
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
        assignments: { "web-developer": live(), "web-reviewer": live() },
      },
      b: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
    })

    expect(summarize(config).ejectedCount).toBe(1)
  })
})

describe("selectRosterGroups", () => {
  const allRows = (config: ConfigSelection) =>
    selectRosterGroups(config, []).flatMap((group) => group.agents)

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
          assignments: { "web-developer": live(), "web-reviewer": off() },
        },
      })
    )

    expect(rows.find((row) => row.agent.id === "web-developer")?.on).toBe(true)
    // A disabled row keeps the skill listed but does not switch the agent on.
    const reviewer = rows.find((row) => row.agent.id === "web-reviewer")!
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
          assignments: { "web-developer": live(), "web-reviewer": live() },
        },
      }),
      []
    )
    const web = groups.find((group) => group.domainId === "web")!

    expect(web.onCount).toBe(2)
    expect(web.agents.length).toBeGreaterThan(2)
  })

  it("lists where-used only across on agents carrying the skill live", () => {
    const rows = allRows(
      scratch(
        {
          a: {
            ...DEFAULT_SKILL_OPTIONS,
            assignments: {
              "web-developer": live(),
              "web-reviewer": live(),
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

    expect(usedBy).toEqual(["web-developer", "web-reviewer"])
  })
})

// The roster row is where a model, an effort and a scope become visible, and
// the store holds only explicit choices — so resolving the resting value is a
// derivation, not a default written into state.
describe("roster model, effort and scope", () => {
  const rowFor = (config: ConfigSelection, agentId: string) =>
    selectRosterGroups(config, [])
      .flatMap((group) => group.agents)
      .find((row) => row.agent.id === agentId)!

  const WEB_DEVELOPER_MODEL = SUB_AGENTS_BY_ID["web-developer"]!.model

  // There is no single default for the model: an agent rests on the one its own
  // metadata names, and only falls back to sonnet when it names none. Scope is
  // the opposite — the catalogue says nothing about it, so every agent rests on
  // the CLI's own default of writing front-matter into the project.
  it("rests every agent on its catalogue model, medium effort and project", () => {
    const rows = selectRosterGroups(scratch(), []).flatMap(
      (group) => group.agents
    )

    for (const row of rows) {
      expect(row.model).toBe(SUB_AGENTS_BY_ID[row.agent.id]?.model ?? "sonnet")
      expect(row.effort).toBe("medium")
      expect(row.scope).toBe("project")
    }
  })

  it("prefers an explicit choice over the resting value", () => {
    const row = rowFor(
      scratch(
        {},
        { "web-developer": { model: "haiku", effort: "max", scope: "global" } }
      ),
      "web-developer"
    )

    expect(row.model).toBe("haiku")
    expect(row.effort).toBe("max")
    expect(row.scope).toBe("global")
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
    expect(row.scope).toBe("project")
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
      scope: "global",
      assignments: {},
    },
    [EXPANSION.skillIds[1]!]: {
      ...DEFAULT_SKILL_OPTIONS,
      assignments: {},
    },
  })

  it("splits skills by scope", () => {
    const inventory = selectInstallInventory(config, [])

    expect(inventory.global.map((skill) => skill.id)).toEqual([FIRST_SKILL])
    expect(inventory.project.map((skill) => skill.id)).toEqual([
      EXPANSION.skillIds[1],
    ])
  })

  // Insertion order would reshuffle the pane as skills are toggled.
  it("orders agents by the catalog, not by which skill referenced them first", () => {
    const applied = asApplied()
    const forward = selectInstallInventory(applied, [])
    const reversed = selectInstallInventory(
      {
        ...applied,
        skills: Object.fromEntries(Object.entries(applied.skills).reverse()),
      },
      []
    )

    expect(forward.agents.map(({ agent }) => agent.id)).toEqual(
      reversed.agents.map(({ agent }) => agent.id)
    )
  })

  it("includes a pinned bare agent, marked base-only", () => {
    const inventory = selectInstallInventory(
      scratch({}, { "web-developer": { on: true } }),
      []
    )

    expect(inventory.agents).toHaveLength(1)
    expect(inventory.agents[0]!.agent.id).toBe("web-developer")
    expect(inventory.agents[0]!.baseOnly).toBe(true)
  })

  // The pane splits the agents by scope exactly as it splits the skills, so
  // every agent has to carry where its front-matter lands — resolved, since
  // the store holds only the agents that were moved off project.
  it("carries each agent's resolved scope", () => {
    const inventory = selectInstallInventory(
      scratch(
        {},
        {
          "web-developer": { on: true, scope: "global" },
          "web-reviewer": { on: true },
        }
      ),
      []
    )

    expect(
      Object.fromEntries(
        inventory.agents.map(({ agent, scope }) => [agent.id, scope])
      )
    ).toEqual({ "web-developer": "global", "web-reviewer": "project" })
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
      ),
      []
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
    selectDomainViews(config, [], search(over)).flatMap((domain) =>
      domain.categories.flatMap((category) => category.cells)
    )

  it("renders every domain when nothing is filtered", () => {
    expect(selectDomainViews(empty, [], SEARCH).length).toBe(
      CATALOG.domains.length
    )
  })

  it("narrows to one domain", () => {
    const views = selectDomainViews(empty, [], search({ domain: "web" }))

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
    const views = selectDomainViews(empty, [], search({ q: "zzzznotaskill" }))
    expect(views).toEqual([])
  })

  it("keeps only recommended skills when asked", () => {
    const cells = allCells(empty, { rec: true })

    expect(cells.length).toBeGreaterThan(0)
    expect(
      cells.every((cell) => CATALOG.skillsById[cell.skill.id]?.isRecommended)
    ).toBe(true)
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
          "web-reviewer": live("preloaded"),
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
    selectDomainViews(config, [], SEARCH)
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

  // The exemption is about *swapping out* the thing you conflict with. When
  // React is only implied by Next.js, clicking Angular would not remove it —
  // the store evicts inside one category — so the pair would survive and the
  // exemption must not apply.
  it("disables a sibling that conflicts with a merely implied skill", () => {
    const withNextjs = scratch({
      "web-meta-framework-nextjs": {
        ...DEFAULT_SKILL_OPTIONS,
        assignments: {},
      },
    })

    const angular = cellFor(withNextjs, "web-framework-angular-standalone")!
    expect(angular.incompatible).toBe(true)
    expect(angular.incompatibleReason).toBe("Conflicts with React")

    // React itself is implied, not selected, so it stays a live choice.
    expect(cellFor(withNextjs, "web-framework-react")!.incompatible).toBe(false)
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
    const cells = selectDomainViews(scratch(), [], SEARCH).flatMap((domain) =>
      domain.categories.flatMap((c) => c.cells)
    )

    expect(cells.some((cell) => cell.incompatible)).toBe(false)
  })
})

describe("selectDomainViews with added skills", () => {
  const uncategorised: AddedSkill = {
    id: "github:acme/widget",
    displayName: "widget",
    description: "Added from GitHub",
    monogram: "WI",
    repo: "acme/widget",
    categoryId: null,
    domainId: null,
  }

  it("collects unmatched skills in their own trailing section", () => {
    const views = selectDomainViews(scratch(), [uncategorised], SEARCH)
    const last = views.at(-1)!

    expect(last.id).toBe("added")
    expect(last.categories[0]!.cells.map((cell) => cell.skill.id)).toEqual([
      uncategorised.id,
    ])
  })

  it("marks them so the cell can draw the added tag", () => {
    const views = selectDomainViews(scratch(), [uncategorised], SEARCH)

    expect(views.at(-1)!.categories[0]!.cells[0]!.skill.added).toBe(true)
  })

  // `isRecommended` is a catalog flag, so an added skill can never satisfy it.
  it("hides them under the recommended filter", () => {
    const views = selectDomainViews(
      scratch(),
      [uncategorised],
      search({ rec: true })
    )

    expect(views.some((domain) => domain.id === "added")).toBe(false)
  })
})
