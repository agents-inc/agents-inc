import { MARKETPLACE_CATALOG, MARKETPLACE_REF } from "@workspace/api-mocks"
import type { Provider } from "@workspace/compile"
import {
  CATALOG,
  STACKS,
  SUB_AGENT_GROUPS,
  expandStack,
} from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  liveAssignment,
  offAssignment,
  skillEntry,
} from "@/__tests__/factories/config-selection-factories"
import type { ConfigureSearch } from "@/routes/search"
import {
  externalSkillId,
  useCatalogStore,
  type ExternalSkill,
} from "@/stores/catalog-store"
import type { RosterGroupBy, SkillEntry } from "@/stores/persisted-schema"
import {
  SCOPE_ERROR,
  catalogueSkillCount,
  isStackCustom,
  monogramOf,
  selectDomainTabs,
  selectDomainViews,
  selectAgentsLeftOut,
  selectInstallInventory,
  selectInstalledAgents,
  selectReachability,
  selectRosterGroups,
  summarize,
  toSkillContents,
  type ConfigSelection,
  type DomainView,
} from "./derive"

// The browser covers that the wiring works; these cover that the sums do.

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

// One record per agent, holding all four of its decisions — the pin, the
// model, the effort, the scope — and any of them may be absent.
const scratch = (
  skills: Record<string, SkillEntry> = {},
  agents: ConfigSelection["agents"] = {}
): ConfigSelection => ({ stackId: null, skills, agents })

// A sub-agent that writes files, and one Codex compiles like any other.
const WRITING_AGENT = "web-developer"

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
      skillEntry({
        assignments: Object.fromEntries(
          (EXPANSION.assignmentsBySkill[skillId] ?? []).map(
            ({ agentId, load }) => [agentId, liveAssignment(load)]
          )
        ),
      }),
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
          [FIRST_SKILL]: skillEntry({ assignments: {} }),
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
            [agentId]: liveAssignment(
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
    expect(summarize(scratch())).toStrictEqual({
      skillCount: 0,
      agentCount: 0,
      assignmentCount: 0,
      preloadedCount: 0,
      ejectedCount: 0,
      unscopedAgentCount: 0,
    })
  })

  it("counts each sub-agent once across skills, and assignments every time", () => {
    const config = scratch({
      a: skillEntry({
        assignments: {
          "web-developer": liveAssignment("preloaded"),
          reviewer: liveAssignment("lazy"),
        },
      }),
      b: skillEntry({
        assignments: { "web-developer": liveAssignment("lazy") },
      }),
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
      a: skillEntry({
        assignments: {
          "web-developer": liveAssignment("preloaded"),
          reviewer: offAssignment("preloaded"),
        },
      }),
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
        a: skillEntry({ assignments: { "web-developer": liveAssignment() } }),
      },
      { "web-developer": { on: false } }
    )

    expect(summarize(config)).toMatchObject({
      agentCount: 0,
      assignmentCount: 0,
    })
  })

  // A project skill on a global sub-agent is an error to resolve, not an
  // assignment that does nothing, so it counts.
  it("counts an assignment the two scopes rule out like any other", () => {
    const config = scratch({
      a: skillEntry({
        scope: "project",
        assignments: {
          "web-developer": liveAssignment("preloaded"),
          reviewer: liveAssignment("lazy"),
        },
      }),
    })

    expect(summarize(config)).toMatchObject({
      skillCount: 1,
      agentCount: 2,
      assignmentCount: 2,
      preloadedCount: 1,
    })
  })

  // The one number that changes: how many sub-agents have to be moved. Distinct
  // SUB-AGENTS rather than pairs, because that is the number of clicks it takes
  // to resolve — two project skills on one global sub-agent is one click.
  it("reports no unscoped sub-agents when every scope agrees", () => {
    const config = scratch({
      a: skillEntry({
        scope: "global",
        assignments: {
          "web-developer": liveAssignment(),
          reviewer: liveAssignment(),
        },
      }),
    })

    expect(summarize(config).unscopedAgentCount).toBe(0)
  })

  it("counts each sub-agent needing project scope once", () => {
    const config = scratch({
      a: skillEntry({
        scope: "project",
        assignments: {
          "web-developer": liveAssignment(),
          reviewer: liveAssignment(),
        },
      }),
      b: skillEntry({
        scope: "project",
        assignments: { "web-developer": liveAssignment() },
      }),
    })

    expect(summarize(config).unscopedAgentCount).toBe(2)
  })

  // Pinning the sub-agent into the project is one of the two ways out, and it
  // changes nothing but the error count — everything else was already correct.
  it("clears the count once the sub-agent is pinned to the project", () => {
    const config = scratch(
      {
        a: skillEntry({
          scope: "project",
          assignments: { "web-developer": liveAssignment("preloaded") },
        }),
      },
      { "web-developer": { scope: "project" } }
    )

    expect(summarize(config)).toMatchObject({
      agentCount: 1,
      assignmentCount: 1,
      preloadedCount: 1,
      unscopedAgentCount: 0,
    })
  })

  // The live global skill keeps the sub-agent on, so zero is not zero for a
  // second reason.
  it("does not count a switched-off row as needing anything", () => {
    const config = scratch({
      a: skillEntry({
        scope: "global",
        assignments: { "web-developer": liveAssignment() },
      }),
      b: skillEntry({
        scope: "project",
        assignments: { "web-developer": offAssignment() },
      }),
    })

    expect(summarize(config).unscopedAgentCount).toBe(0)
  })

  // Nor a sub-agent pinned off: it is excluded from every count on screen and
  // from the payload, so there is nothing about it left to block.
  it("does not count a pinned-off sub-agent as needing anything", () => {
    const config = scratch(
      {
        a: skillEntry({
          scope: "project",
          assignments: { "web-developer": liveAssignment() },
        }),
      },
      { "web-developer": { on: false } }
    )

    expect(summarize(config).unscopedAgentCount).toBe(0)
  })

  it("counts ejected skills rather than ejected assignments", () => {
    const config = scratch({
      a: skillEntry({
        install: "eject",
        assignments: {
          "web-developer": liveAssignment(),
          reviewer: liveAssignment(),
        },
      }),
      b: skillEntry({ assignments: {} }),
    })

    expect(summarize(config).ejectedCount).toBe(1)
  })
})

const rosterGroups = (
  config: ConfigSelection,
  groupBy: RosterGroupBy = "domain",
  provider: Provider = "claude"
) => selectRosterGroups(config, groupBy, provider)

describe("selectRosterGroups", () => {
  const allRows = (config: ConfigSelection) =>
    rosterGroups(config).flatMap((group) => group.agents)

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
        a: skillEntry({
          assignments: {
            "web-developer": liveAssignment(),
            reviewer: offAssignment(),
          },
        }),
      })
    )

    expect(rows.find((row) => row.agent.id === "web-developer")?.on).toBe(true)
    // A disabled row keeps the skill listed but does not switch the agent on.
    const reviewer = rows.find((row) => row.agent.id === "reviewer")!
    expect(reviewer.on).toBe(false)
    expect(reviewer.skills.map((skill) => skill.id)).toStrictEqual(["a"])
    expect(reviewer.skills[0]!.enabled).toBe(false)
  })

  it("lets a pin override the derived state in both directions", () => {
    const rows = allRows(
      scratch(
        {
          a: skillEntry({ assignments: { "web-developer": liveAssignment() } }),
        },
        { "web-developer": { on: false }, "web-tester": { on: true } }
      )
    )

    expect(rows.find((row) => row.agent.id === "web-developer")?.on).toBe(false)
    expect(rows.find((row) => row.agent.id === "web-tester")?.on).toBe(true)
  })

  it("bands by domain, in the catalogue's order and under its labels", () => {
    const groups = rosterGroups(scratch())

    expect(groups.map(({ key, label }) => ({ key, label }))).toStrictEqual(
      SUB_AGENT_GROUPS.map(({ domainId, label }) => ({ key: domainId, label }))
    )
  })

  // The consolidated reviewer bands under meta, not under the domain whose
  // skill it happens to carry.
  it("bands the reviewer under meta", () => {
    const groups = rosterGroups(
      scratch({
        a: skillEntry({
          assignments: {
            "web-developer": liveAssignment(),
            reviewer: liveAssignment(),
          },
        }),
      })
    )
    const idsIn = (key: string) =>
      groups
        .find((group) => group.key === key)!
        .agents.map((row) => row.agent.id)

    expect(idsIn("meta")).toContain("reviewer")
    expect(idsIn("web")).not.toContain("reviewer")
  })

  it("does not switch an agent on for carrying an option", () => {
    const rows = allRows(scratch({}, { "web-developer": { model: "haiku" } }))

    expect(rows.find((row) => row.agent.id === "web-developer")!.on).toBe(false)
  })

  it("lists where-used only across on agents carrying the skill live", () => {
    const rows = allRows(
      scratch(
        {
          a: skillEntry({
            assignments: {
              "web-developer": liveAssignment(),
              reviewer: liveAssignment(),
              // Disabled — must not appear as a use.
              "web-tester": offAssignment(),
              // Live, but the agent is pinned off — must not appear either.
              "api-developer": liveAssignment(),
            },
          }),
        },
        { "api-developer": { on: false } }
      )
    )

    const usedBy = rows
      .find((row) => row.agent.id === "web-developer")!
      .skills[0]!.usedBy.map((agent) => agent.id)

    expect(usedBy).toStrictEqual(["web-developer", "reviewer"])
  })

  // The marker says which row is wrong; the agent stays on.
  it("marks a row the two scopes rule out, leaving the sub-agent on", () => {
    const rows = allRows(
      scratch({
        a: skillEntry({
          scope: "project",
          assignments: { "web-developer": liveAssignment() },
        }),
      })
    )
    const developer = rows.find((row) => row.agent.id === "web-developer")!

    expect(developer.on).toBe(true)
    expect(developer.skills.map((skill) => skill.id)).toStrictEqual(["a"])
    expect(developer.skills[0]!.scopeError).toBe(SCOPE_ERROR)
  })

  it("leaves a row the scopes allow unmarked", () => {
    const rows = allRows(
      scratch({
        a: skillEntry({
          scope: "global",
          assignments: { "web-developer": liveAssignment() },
        }),
      })
    )

    expect(
      rows.find((row) => row.agent.id === "web-developer")!.skills[0]!
        .scopeError
    ).toBeUndefined()
  })

  // A switched-off row is the user's decision, not a problem to fix.
  it("does not mark a switched-off row", () => {
    const rows = allRows(
      scratch({
        a: skillEntry({
          scope: "project",
          assignments: { "web-developer": offAssignment() },
        }),
      })
    )
    const row = rows.find((agentRow) => agentRow.agent.id === "web-developer")!
      .skills[0]!

    expect(row.enabled).toBe(false)
    expect(row.scopeError).toBeUndefined()
  })

  // An erroring row is still carried, so it is still a use.
  it("lists an erroring row among the skill's uses", () => {
    const rows = allRows(
      scratch(
        {
          a: skillEntry({
            scope: "project",
            assignments: {
              "web-developer": liveAssignment(),
              reviewer: liveAssignment(),
            },
          }),
        },
        { reviewer: { scope: "project" } }
      )
    )

    expect(
      rows
        .find((row) => row.agent.id === "reviewer")!
        .skills[0]!.usedBy.map((agent) => agent.id)
    ).toStrictEqual(["web-developer", "reviewer"])
  })
})

// The second banding: only the key, the label and which agents fall into
// which band differ from the first.
describe("selectRosterGroups grouped by scope", () => {
  // The prefix keeps the key space disjoint from domain ids in the one
  // `rosterCollapsed` record both modes share.
  const SCOPE_GROUP_KEYS = ["scope:global", "scope:project"] as const
  // Space, U+00B7 MIDDLE DOT, space. Global first.
  const CLAUDE_LABELS = ["~/.claude · global", "./.claude · project"] as const
  const CODEX_LABELS = ["~/.codex · global", "./.codex · project"] as const

  // Every agent rests at global, so two bands need one moved.
  const withOneAtProject = () =>
    scratch(
      {
        a: skillEntry({ assignments: { "web-developer": liveAssignment() } }),
      },
      { "web-developer": { scope: "project" } }
    )

  it("bands by destination, global first", () => {
    const groups = rosterGroups(withOneAtProject(), "scope")

    expect(groups.map((group) => group.key)).toStrictEqual([
      ...SCOPE_GROUP_KEYS,
    ])
  })

  it("labels each band with the path Claude writes into", () => {
    const groups = rosterGroups(withOneAtProject(), "scope", "claude")

    expect(groups.map((group) => group.label)).toStrictEqual([...CLAUDE_LABELS])
  })

  it("labels each band with the path Codex writes into", () => {
    const groups = rosterGroups(withOneAtProject(), "scope", "codex")

    expect(groups.map((group) => group.label)).toStrictEqual([...CODEX_LABELS])
  })

  it("moves an agent out of one band and into the other", () => {
    const groups = rosterGroups(withOneAtProject(), "scope")
    const idsIn = (key: string) =>
      groups
        .find((group) => group.key === key)!
        .agents.map((row) => row.agent.id)
    const everyAgent = SUB_AGENT_GROUPS.flatMap((group) => group.agents).length

    expect(idsIn("scope:project")).toStrictEqual(["web-developer"])
    expect(idsIn("scope:global")).not.toContain("web-developer")
    expect(idsIn("scope:global")).toHaveLength(everyAgent - 1)
  })

  // Not drawn empty — not drawn. The state every visitor opens on.
  it("omits a destination nobody writes to", () => {
    const groups = rosterGroups(scratch(), "scope")

    expect(groups.map((group) => group.key)).toStrictEqual(["scope:global"])
  })

  it("hands back a byte-identical agent row in either mode", () => {
    const config = withOneAtProject()
    const rowIn = (groupBy: RosterGroupBy) =>
      rosterGroups(config, groupBy)
        .flatMap((group) => group.agents)
        .find((row) => row.agent.id === "web-developer")!

    expect(rowIn("scope")).toStrictEqual(rowIn("domain"))
  })
})

describe("selectInstallInventory", () => {
  const config = scratch({
    [FIRST_SKILL]: skillEntry({ scope: "project", assignments: {} }),
    [EXPANSION.skillIds[1]!]: skillEntry({ scope: "global", assignments: {} }),
  })

  it("splits skills by scope", () => {
    const inventory = selectInstallInventory(config, "claude")

    expect(inventory.project.map((skill) => skill.id)).toStrictEqual([
      FIRST_SKILL,
    ])
    expect(inventory.global.map((skill) => skill.id)).toStrictEqual([
      EXPANSION.skillIds[1],
    ])
  })

  // Insertion order would reshuffle the pane as skills are toggled.
  it("orders agents by the catalog, not by which skill referenced them first", () => {
    const applied = asApplied()
    const forward = selectInstallInventory(applied, "claude")
    const reversed = selectInstallInventory(
      {
        ...applied,
        skills: Object.fromEntries(Object.entries(applied.skills).reverse()),
      },
      "claude"
    )

    expect(forward.agents.map(({ agent }) => agent.id)).toStrictEqual(
      reversed.agents.map(({ agent }) => agent.id)
    )
  })

  it("includes a pinned bare agent, marked base-only", () => {
    const inventory = selectInstallInventory(
      scratch({}, { "web-developer": { on: true } }),
      "claude"
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
      ),
      "claude"
    )

    expect(
      Object.fromEntries(
        inventory.agents.map(({ agent, scope }) => [agent.id, scope])
      )
    ).toStrictEqual({ "web-developer": "project", reviewer: "global" })
  })

  // The pane lists what the install writes, and the install is blocked while an
  // error stands — so the pane is only ever read in a resolvable state. What it
  // must not do is describe a different configuration from the one on screen.
  it("lists an agent whose skills the scopes rule out", () => {
    const inventory = selectInstallInventory(
      scratch({
        a: skillEntry({
          scope: "project",
          assignments: { "web-developer": liveAssignment() },
        }),
      }),
      "claude"
    )

    expect(inventory.agents.map(({ agent }) => agent.id)).toStrictEqual([
      "web-developer",
    ])
  })

  // And it holds a skill, so it is not a bare agent. `baseOnly` says "this file
  // has no skills in it", which would be a second thing the pane got wrong.
  it("does not call it base-only — it holds a skill", () => {
    const inventory = selectInstallInventory(
      scratch({
        a: skillEntry({
          scope: "project",
          assignments: { "web-developer": liveAssignment() },
        }),
      }),
      "claude"
    )

    expect(inventory.agents[0]!.baseOnly).toBe(false)
  })

  it("excludes a pinned-off agent even when skills point at it", () => {
    const inventory = selectInstallInventory(
      scratch(
        {
          a: skillEntry({ assignments: { "web-developer": liveAssignment() } }),
        },
        { "web-developer": { on: false } }
      ),
      "claude"
    )

    expect(inventory.agents).toStrictEqual([])
  })
})

// A Codex install drops both summoners, and every shipped stack staffs them.
// The Claude arm is the control: "Codex installs fewer" is also met by a
// selector that dropped the whole roster.
describe("the sub-agents a provider would actually install", () => {
  const SUMMONERS = ["agent-summoner", "skill-summoner"] as const

  const withBothSummoners = scratch(
    {},
    {
      [SUMMONERS[0]]: { on: true },
      [SUMMONERS[1]]: { on: true },
      [WRITING_AGENT]: { on: true },
    }
  )

  // Sorted on both sides: catalogue order is pinned elsewhere.
  const idsOf = (agents: readonly { id: string }[]) =>
    agents.map((agent) => agent.id).sort()

  it("counts all three on Claude", () => {
    expect(
      idsOf(selectInstalledAgents(withBothSummoners, "claude"))
    ).toStrictEqual([...SUMMONERS, WRITING_AGENT].sort())
  })

  it("counts only the one Codex compiles", () => {
    expect(
      idsOf(selectInstalledAgents(withBothSummoners, "codex"))
    ).toStrictEqual([WRITING_AGENT])
  })

  // The dialog has to be able to SAY which two, rather than quietly listing one
  // fewer row than the roster shows — D18's reasoning arriving one surface over.
  it("names the ones it dropped, and names none on Claude", () => {
    expect(
      idsOf(selectAgentsLeftOut(withBothSummoners, "codex"))
    ).toStrictEqual([...SUMMONERS].sort())
    expect(selectAgentsLeftOut(withBothSummoners, "claude")).toStrictEqual([])
  })

  // A summoner nobody pinned is not something the install "left out" — it was
  // never in it. Without this the notice fires on every Codex configuration.
  it("names nothing for a summoner that was never on", () => {
    expect(
      selectAgentsLeftOut(
        scratch({}, { [WRITING_AGENT]: { on: true } }),
        "codex"
      )
    ).toStrictEqual([])
  })

  // The install dialog's own list must agree with the preview beside it.
  it("keeps them out of the install inventory on Codex, and in it on Claude", () => {
    const on = (provider: "claude" | "codex") =>
      idsOf(
        selectInstallInventory(withBothSummoners, provider).agents.map(
          ({ agent }) => agent
        )
      )

    expect(on("codex")).toStrictEqual([WRITING_AGENT])
    expect(on("claude")).toStrictEqual([...SUMMONERS, WRITING_AGENT].sort())
  })

  // The arithmetic the two surfaces state, over a real stack rather than a
  // hand-built pair — this is the configuration a visitor actually arrives with.
  it("drops the two summoners out of an applied stack's count", () => {
    const applied = asApplied()
    const onClaude = selectInstalledAgents(applied, "claude")
    const onCodex = selectInstalledAgents(applied, "codex")

    for (const summoner of SUMMONERS) {
      expect(idsOf(onClaude)).toContain(summoner)
      expect(idsOf(onCodex)).not.toContain(summoner)
    }
    expect(onCodex.length).toBe(onClaude.length - 2)
    expect(summarize(applied).agentCount).toBe(onClaude.length)
  })
})

describe("selectDomainViews", () => {
  const selected = scratch({
    [FIRST_SKILL]: skillEntry({ assignments: {} }),
  })
  const empty = scratch()

  const allCells = (config: ConfigSelection, over?: Partial<ConfigureSearch>) =>
    selectDomainViews(config, search(over)).flatMap((domain) =>
      domain.categories.flatMap((category) => category.cells)
    )

  it("renders every domain when nothing is filtered", () => {
    expect(selectDomainViews(empty, SEARCH).length).toBe(CATALOG.domains.length)
  })

  // A pick is a scroll target, not a filter (EDITOR-79).
  it("renders every domain when one of them is picked", () => {
    const views = selectDomainViews(empty, search({ domain: "web" }))

    expect(views.map((view) => view.id)).toStrictEqual(
      selectDomainViews(empty, SEARCH).map((view) => view.id)
    )
  })

  // A query reaches past the picked domain (EDITOR-64). The reported case:
  // `meta-config-stack-detect` sits in `shared`, not `meta`.
  it("finds a skill through a query with another domain in the address", () => {
    const id = "meta-config-stack-detect"
    const home = CATALOG.skillsById[id]!.domainId
    const elsewhere = CATALOG.domains.find((domain) => domain.id !== home)!

    const ids = allCells(empty, {
      domain: elsewhere.id,
      q: "stack detect",
    }).map((cell) => cell.skill.id)

    expect(ids).toContain(id)
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
    expect(views).toStrictEqual([])
  })

  it("keeps only selected skills when asked", () => {
    const cells = allCells(selected, { sel: true })

    expect(cells.map((cell) => cell.skill.id)).toStrictEqual([FIRST_SKILL])
    expect(cells.every((cell) => cell.selected)).toBe(true)
  })

  it("shows nothing selected as nothing at all", () => {
    expect(allCells(empty, { sel: true })).toStrictEqual([])
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
    "web-framework-react": skillEntry({ assignments: {} }),
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
  // which nothing selected rules out.
  it("leaves a skill selectable while the host it needs is merely unselected", () => {
    const expo = cellFor(withReact, "mobile-framework-expo")!

    expect(expo.incompatible).toBe(false)
    expect(expo.incompatibleReason).toBeUndefined()
  })

  // Both are meta-frameworks, so swapping really is the way between them.
  it("still leaves the implier's own siblings swappable", () => {
    const withNextjs = scratch({
      "web-meta-framework-nextjs": skillEntry({ assignments: {} }),
    })

    expect(cellFor(withNextjs, "web-meta-framework-remix")!.incompatible).toBe(
      false
    )
  })

  // Its requirement is unsatisfiable whichever sibling you swap to, so the
  // sibling exemption must not rescue it.
  it("disables a sibling whose own requirement is out of reach", () => {
    const config = scratch({
      "web-framework-react": skillEntry({ assignments: {} }),
      "web-meta-framework-nextjs": skillEntry({ assignments: {} }),
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

// An added skill is a real catalogue entry, with no second code path.
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
      [HOUSE_ID]: skillEntry({
        install: "eject",
        scope: "project",
        assignments: { "web-developer": liveAssignment() },
      }),
    })

  beforeEach(() => {
    useCatalogStore.getState().addExternal([house])
  })

  afterEach(() => {
    useCatalogStore.getState().reset()
  })

  const cellsIn = (view: DomainView, categoryId: string) =>
    view.categories.find((category) => category.id === categoryId)?.cells ?? []

  // It sits inside a real domain, beside the skills it belongs with.
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
    const rows = rosterGroups(picked())
      .flatMap((group) => group.agents)
      .flatMap((agent) => agent.skills)

    expect(rows.map((row) => row.displayName)).toContain("House React")
  })

  it("is listed in the install inventory under its own name", () => {
    const inventory = selectInstallInventory(picked(), "claude")

    expect(inventory.project.map((skill) => skill.displayName)).toStrictEqual([
      "House React",
    ])
  })

  // The install pane is a second way into the contents preview (EDITOR-32).
  it("is marked in the install inventory as one whose contents can be read", () => {
    const inventory = selectInstallInventory(picked(), "claude")

    expect(inventory.project[0]?.added).toBe(true)
  })
})

// A shared link carries a stranger's files, so they can be read before
// installing (EDITOR-32). A rendering over the seat, never a fetch.
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

  // SKILL.md is what a reader is deciding whether to trust.
  it("opens on SKILL.md however the directory listed it", () => {
    expect(paths()[0]).toBe("SKILL.md")
  })

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

// A cell's source link follows the SEATED marketplace, whose skills the grid
// draws (EDITOR-44).
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

// The catalogue's count, blind to every filter.
describe("catalogueSkillCount", () => {
  it("is every skill the catalogue holds", () => {
    expect(catalogueSkillCount()).toBe(
      CATALOG.domains.reduce((total, domain) => total + domain.skillCount, 0)
    )
  })

  // The assertion that keeps the hinge and the strip honest with each other:
  // one number over nine, summed the other way round.
  it("agrees with the strip's own per-domain counts", () => {
    expect(catalogueSkillCount()).toBe(
      selectDomainTabs().reduce((total, tab) => total + tab.skillCount, 0)
    )
  })
})
