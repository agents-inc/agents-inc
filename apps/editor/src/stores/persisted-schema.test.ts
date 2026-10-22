import {
  CATALOG,
  CODEX_MODEL_NAMES,
  DEFAULT_SELECTION_OPTIONS,
  STACKS,
  SUB_AGENTS_BY_ID,
} from "@workspace/matrix"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  liveAssignment,
  offAssignment,
  persistedConfig,
  skillEntry,
} from "@/__tests__/factories/config-selection-factories"
import { setReportingSink } from "@/lib/observability/report"

import type { ReportingSink } from "@/lib/observability/report"

import {
  AGENT_EFFORTS,
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
  agentEffortSchema,
  chosenModelFor,
  isAgentOn,
  isScopePairCompatible,
  isWorthRemembering,
  migrateConfig,
  modelChoicesFor,
  modelPatchFor,
  persistedConfigSchema,
  persistedUiSchema,
  pruneUnknownIds,
  reachesAgent,
  resolveAgentOptions,
  restingAgentOptions,
  type AgentEntry,
} from "./persisted-schema"

const KNOWN_SKILL = Object.keys(CATALOG.skillsById)[0]!
const KNOWN_AGENT = Object.keys(SUB_AGENTS_BY_ID)[0]!
const KNOWN_STACK = STACKS[0]!.id
const GONE_SKILL = "removed-in-a-later-release"
const GONE_AGENT = "retired-agent"
const PINNED_CODEX_MODEL = "gpt-5.6-terra" as const

// A bump discards every visitor's saved configuration.
describe("PERSIST_VERSION", () => {
  it("is 8", () => {
    expect(PERSIST_VERSION).toBe(8)
  })
})

// The scale is a wire contract: narrowing it fails a stored blob's whole parse,
// and renaming a level breaks share links in both directions.
describe("AGENT_EFFORTS", () => {
  it("holds five levels, spelled as the contract spells them", () => {
    expect(AGENT_EFFORTS).toStrictEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
  })

  it("accepts every one of them and nothing else", () => {
    for (const effort of AGENT_EFFORTS) {
      expect(agentEffortSchema.safeParse(effort).success).toBe(true)
    }
    expect(agentEffortSchema.safeParse("med").success).toBe(false)
  })
})

describe("persistedConfigSchema", () => {
  // Raw rather than typed: a stale blob is `unknown`.
  it("no longer keeps a model or an effort on a skill", () => {
    const parsed = persistedConfigSchema.parse({
      ...persistedConfig(),
      skills: {
        [KNOWN_SKILL]: { ...skillEntry(), model: "opus", effort: "max" },
      },
    })

    expect(parsed.skills[KNOWN_SKILL]).not.toHaveProperty("model")
    expect(parsed.skills[KNOWN_SKILL]).not.toHaveProperty("effort")
  })

  it.each([
    ["nothing at all", {}],
    ["only a pin", { on: true }],
    ["only a model", { model: "haiku" }],
    ["only an effort", { effort: "xhigh" }],
    ["only a scope", { scope: "global" }],
    [
      "all four",
      { on: false, model: "fable", effort: "low", scope: "project" },
    ],
  ] as const)("accepts an agent carrying %s", (_label, agent) => {
    const parsed = persistedConfigSchema.safeParse(
      persistedConfig({ agents: { [KNOWN_AGENT]: agent } })
    )

    expect(parsed.success).toBe(true)
  })

  it.each([
    ["a model the CLI does not offer", { model: "gpt" }],
    ["an effort level that does not exist", { effort: "ultra" }],
    ["a scope that is nowhere the CLI writes", { scope: "user" }],
  ])("refuses %s", (_label, agent) => {
    const parsed = persistedConfigSchema.safeParse({
      ...persistedConfig(),
      agents: { [KNOWN_AGENT]: agent },
    })

    expect(parsed.success).toBe(false)
    expect(
      parsed.error?.issues.map((issue) => issue.path.join("."))
    ).toContainEqual(expect.stringContaining(`agents.${KNOWN_AGENT}`))
  })

  it("keeps the description a configuration arrived with", () => {
    const parsed = persistedConfigSchema.parse(
      persistedConfig({ description: "The house web app." })
    )

    expect(parsed.description).toBe("The house web app.")
  })

  it("refuses a v6 blob that has pins instead of agents", () => {
    const v6 = {
      stackId: null,
      skills: {},
      remembered: {},
      pins: { [KNOWN_AGENT]: true },
    }

    expect(persistedConfigSchema.safeParse(v6).success).toBe(false)
  })
})

// Unlike `model`, an id Codex retires must not cost the visitor their whole
// saved configuration: only that field goes.
describe("a stored Codex model", () => {
  it("rests an untouched agent on inherit", () => {
    expect(restingAgentOptions(KNOWN_AGENT).codexModel).toBe("inherit")
  })

  it("parses an agent stored without one, which runs on inherit", () => {
    const parsed = persistedConfigSchema.parse(
      persistedConfig({ agents: { [KNOWN_AGENT]: { model: "haiku" } } })
    )

    expect(resolveAgentOptions(parsed.agents, KNOWN_AGENT)).toMatchObject({
      model: "haiku",
      codexModel: "inherit",
    })
  })

  it.each(CODEX_MODEL_NAMES)("keeps a stored %s pin", (codexModel) => {
    const parsed = persistedConfigSchema.parse({
      ...persistedConfig(),
      agents: { [KNOWN_AGENT]: { codexModel } },
    })

    expect(resolveAgentOptions(parsed.agents, KNOWN_AGENT).codexModel).toBe(
      codexModel
    )
  })

  it.each([
    ["a retired id", "gpt-4o"],
    ["the resting word", "inherit"],
    ["an empty id", ""],
    ["a number", 7],
  ])("drops %s and keeps the rest of the blob", (_label, codexModel) => {
    const blob = {
      ...persistedConfig({
        stackId: KNOWN_STACK,
        skills: { [KNOWN_SKILL]: skillEntry() },
      }),
      agents: { [KNOWN_AGENT]: { on: true, model: "haiku", codexModel } },
    }

    const parsed = persistedConfigSchema.safeParse(blob)

    expect(parsed.success).toBe(true)
    expect(parsed.data?.stackId).toBe(KNOWN_STACK)
    expect(parsed.data?.skills).toStrictEqual(blob.skills)
    expect(parsed.data?.agents[KNOWN_AGENT]?.on).toBe(true)
    expect(parsed.data?.agents[KNOWN_AGENT]).not.toHaveProperty("codexModel")
    expect(resolveAgentOptions(parsed.data!.agents, KNOWN_AGENT)).toMatchObject(
      { model: "haiku", codexModel: "inherit" }
    )
  })
})

describe("modelChoicesFor", () => {
  it("offers Claude's four models, each labelled by its own name", () => {
    expect(modelChoicesFor("claude")).toStrictEqual([
      { value: "opus", label: "opus" },
      { value: "fable", label: "fable" },
      { value: "sonnet", label: "sonnet" },
      { value: "haiku", label: "haiku" },
    ])
  })

  // No `inherit` choice; nothing pressed is the session's model.
  it("offers the four Codex models by their short names, and nothing else", () => {
    expect(modelChoicesFor("codex")).toStrictEqual([
      { value: "gpt-6-astra", label: "astra" },
      { value: "gpt-5.6-sol", label: "sol" },
      { value: "gpt-5.6-terra", label: "terra" },
      { value: "gpt-5.6-luna", label: "luna" },
    ])
  })
})

// Both pins live on one entry and each provider reads its own, so a pick on one
// must never move the other's.
describe("chosenModelFor", () => {
  const pinnedOn = (entry: AgentEntry) =>
    resolveAgentOptions({ [KNOWN_AGENT]: entry }, KNOWN_AGENT)

  it("reads each provider's own pin off one entry", () => {
    const options = pinnedOn({ model: "haiku", codexModel: PINNED_CODEX_MODEL })

    expect(chosenModelFor("claude", options)).toBe("haiku")
    expect(chosenModelFor("codex", options)).toBe(PINNED_CODEX_MODEL)
  })

  it("reads the resting Claude model past a Codex pin", () => {
    const options = pinnedOn({ codexModel: PINNED_CODEX_MODEL })

    expect(chosenModelFor("claude", options)).toBe(
      restingAgentOptions(KNOWN_AGENT).model
    )
  })

  it("reads inherit on Codex past a Claude pin", () => {
    expect(chosenModelFor("codex", pinnedOn({ model: "haiku" }))).toBe(
      "inherit"
    )
  })
})

describe("modelPatchFor", () => {
  it("writes a Claude pick to the Claude model alone", () => {
    expect(modelPatchFor("claude", "haiku")).toStrictEqual({ model: "haiku" })
  })

  it("writes a Codex pick to the Codex model alone", () => {
    expect(modelPatchFor("codex", PINNED_CODEX_MODEL)).toStrictEqual({
      codexModel: PINNED_CODEX_MODEL,
    })
  })

  // The resting value, which `setAgentOption` drops rather than stores.
  it("writes inherit as the Codex model", () => {
    expect(modelPatchFor("codex", "inherit")).toStrictEqual({
      codexModel: "inherit",
    })
  })
})

// A fresh pick is global on both surfaces, spelled once by the matrix.
describe("fresh-pick defaults", () => {
  it("installs a freshly picked skill as a plugin, into the global scope", () => {
    expect(DEFAULT_SKILL_OPTIONS).toStrictEqual({
      install: "plugin",
      scope: "global",
    })
  })

  it("rests an untouched agent in the global scope", () => {
    expect(restingAgentOptions(KNOWN_AGENT).scope).toBe("global")
  })

  it("spells both defaults from the shared matrix constant", () => {
    expect(DEFAULT_SKILL_OPTIONS).toStrictEqual(DEFAULT_SELECTION_OPTIONS)
    expect(restingAgentOptions(KNOWN_AGENT).scope).toBe(
      DEFAULT_SELECTION_OPTIONS.scope
    )
  })
})

describe("isWorthRemembering", () => {
  it("drops an entry carrying no decisions", () => {
    expect(isWorthRemembering(skillEntry())).toBe(false)
  })

  it.each([
    ["a non-default install mode", { install: "eject" as const }],
    ["a non-default scope", { scope: "project" as const }],
  ])("keeps an entry with %s", (_label, over) => {
    expect(isWorthRemembering(skillEntry(over))).toBe(true)
  })

  // A stack hands a skill its assignments without a click, and losing them to
  // a stray toggle costs as much as losing hand-built ones.
  it("keeps a stack-provided entry whose only content is assignments", () => {
    const stackProvided = skillEntry({
      assignments: { [KNOWN_AGENT]: liveAssignment("preloaded") },
    })

    expect(stackProvided).toMatchObject(DEFAULT_SKILL_OPTIONS)
    expect(isWorthRemembering(stackProvided)).toBe(true)
  })

  it("keeps an entry whose only content is disabled rows", () => {
    expect(
      isWorthRemembering(
        skillEntry({
          assignments: { [KNOWN_AGENT]: offAssignment("preloaded") },
        })
      )
    ).toBe(true)
  })
})

// A global sub-agent carrying a project skill names something that does not
// exist outside that project; the CLI's `init --from` refuses the pair.
describe("isScopePairCompatible", () => {
  it.each([
    ["global", "global", true],
    ["global", "project", true],
    ["project", "project", true],
    ["project", "global", false],
  ] as const)(
    "a %s skill on a %s sub-agent is %s",
    (skillScope, agentScope, allowed) => {
      expect(isScopePairCompatible(skillScope, agentScope)).toBe(allowed)
    }
  )
})

describe("reachesAgent", () => {
  it("refuses a project skill for an agent resting at global", () => {
    expect(reachesAgent({}, "project", KNOWN_AGENT)).toBe(false)
  })

  it("allows it once that agent is pinned to the project", () => {
    expect(
      reachesAgent(
        { [KNOWN_AGENT]: { scope: "project" } },
        "project",
        KNOWN_AGENT
      )
    ).toBe(true)
  })

  it("allows a global skill either way", () => {
    expect(reachesAgent({}, "global", KNOWN_AGENT)).toBe(true)
    expect(
      reachesAgent(
        { [KNOWN_AGENT]: { scope: "project" } },
        "global",
        KNOWN_AGENT
      )
    ).toBe(true)
  })
})

describe("isAgentOn", () => {
  it("is off with no skills and no pin", () => {
    expect(isAgentOn(persistedConfig(), KNOWN_AGENT)).toBe(false)
  })

  it("derives on from holding an enabled skill", () => {
    const holding = persistedConfig({
      skills: {
        [KNOWN_SKILL]: skillEntry({
          assignments: { [KNOWN_AGENT]: liveAssignment() },
        }),
      },
    })

    expect(isAgentOn(holding, KNOWN_AGENT)).toBe(true)
  })

  it("stays off when its only assignment is disabled", () => {
    const disabled = persistedConfig({
      skills: {
        [KNOWN_SKILL]: skillEntry({
          assignments: { [KNOWN_AGENT]: offAssignment("preloaded") },
        }),
      },
    })

    expect(isAgentOn(disabled, KNOWN_AGENT)).toBe(false)
  })

  it("lets a pin override the derived state in both directions", () => {
    const holding = persistedConfig({
      skills: {
        [KNOWN_SKILL]: skillEntry({
          assignments: { [KNOWN_AGENT]: liveAssignment() },
        }),
      },
      agents: { [KNOWN_AGENT]: { on: false } },
    })
    const bare = persistedConfig({ agents: { [KNOWN_AGENT]: { on: true } } })

    expect(isAgentOn(holding, KNOWN_AGENT)).toBe(false)
    expect(isAgentOn(bare, KNOWN_AGENT)).toBe(true)
  })

  // Tri-state: only an explicit `on` decides; an entry holding only a model
  // still asks the assignments.
  it("ignores an entry that names no pin", () => {
    const chosen = { model: "haiku" as const, effort: "max" as const }

    expect(
      isAgentOn(
        persistedConfig({ agents: { [KNOWN_AGENT]: chosen } }),
        KNOWN_AGENT
      )
    ).toBe(false)
    expect(
      isAgentOn(
        persistedConfig({
          skills: {
            [KNOWN_SKILL]: skillEntry({
              assignments: { [KNOWN_AGENT]: liveAssignment() },
            }),
          },
          agents: { [KNOWN_AGENT]: chosen },
        }),
        KNOWN_AGENT
      )
    ).toBe(true)
  })

  // The scope rule is not asked: the agent stays on so the pair can be fixed
  // from its card.
  it("stays on for an assignment the two scopes rule out", () => {
    const unresolved = persistedConfig({
      skills: {
        [KNOWN_SKILL]: skillEntry({
          scope: "project",
          assignments: { [KNOWN_AGENT]: liveAssignment() },
        }),
      },
    })

    expect(isAgentOn(unresolved, KNOWN_AGENT)).toBe(true)
  })

  it("keeps a pinned-off agent off while it carries a model", () => {
    const pinnedOff = persistedConfig({
      skills: {
        [KNOWN_SKILL]: skillEntry({
          assignments: { [KNOWN_AGENT]: liveAssignment() },
        }),
      },
      agents: { [KNOWN_AGENT]: { on: false, model: "haiku" } },
    })

    expect(isAgentOn(pinnedOff, KNOWN_AGENT)).toBe(false)
  })
})

// A slot written before the provider and sub-agent folds existed must parse
// with both open rather than fail into the defaults.
describe("persistedUiSchema's step folds", () => {
  it("opens both folds for a slot written before they existed", () => {
    const parsed = persistedUiSchema.parse({
      rosterCollapsed: { web: true },
      stackCollapsed: true,
    })

    expect(parsed.rosterCollapsed).toStrictEqual({ web: true })
    expect(parsed.stackCollapsed).toBe(true)
    expect(parsed.providerCollapsed).toBe(false)
    expect(parsed.agentsCollapsed).toBe(false)
  })

  it("catches a garbage fold to open rather than failing the parse", () => {
    const parsed = persistedUiSchema.safeParse({
      rosterCollapsed: {},
      providerCollapsed: "yes",
      agentsCollapsed: 7,
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.providerCollapsed).toBe(false)
    expect(parsed.data?.agentsCollapsed).toBe(false)
  })
})

describe("pruneUnknownIds", () => {
  it("keeps everything the catalog still knows", () => {
    const kept = persistedConfig({
      stackId: KNOWN_STACK,
      skills: {
        [KNOWN_SKILL]: skillEntry({
          assignments: { [KNOWN_AGENT]: liveAssignment() },
        }),
      },
      agents: { [KNOWN_AGENT]: { on: true, model: "haiku" } },
    })

    expect(pruneUnknownIds(kept)).toStrictEqual(kept)
  })

  it("drops a skill the catalog no longer has", () => {
    const pruned = pruneUnknownIds(
      persistedConfig({
        skills: { [KNOWN_SKILL]: skillEntry(), [GONE_SKILL]: skillEntry() },
      })
    )

    expect(Object.keys(pruned.skills)).toStrictEqual([KNOWN_SKILL])
  })

  it("drops a retired sub-agent from inside assignments", () => {
    const pruned = pruneUnknownIds(
      persistedConfig({
        skills: {
          [KNOWN_SKILL]: skillEntry({
            assignments: {
              [KNOWN_AGENT]: liveAssignment(),
              [GONE_AGENT]: liveAssignment("preloaded"),
            },
          }),
        },
      })
    )

    expect(pruned.skills[KNOWN_SKILL]!.assignments).toStrictEqual({
      [KNOWN_AGENT]: liveAssignment(),
    })
  })

  it("drops a retired sub-agent's own record", () => {
    const pruned = pruneUnknownIds(
      persistedConfig({
        agents: {
          [KNOWN_AGENT]: { on: true },
          [GONE_AGENT]: { on: false, model: "haiku" },
        },
      })
    )

    expect(pruned.agents).toStrictEqual({ [KNOWN_AGENT]: { on: true } })
  })

  it("keeps the description, which names no id", () => {
    const described = persistedConfig({
      stackId: "deleted-stack",
      description: "The house web app.",
    })

    expect(pruneUnknownIds(described).description).toBe("The house web app.")
  })

  it("falls back to no stack when the stack is gone", () => {
    expect(
      pruneUnknownIds(persistedConfig({ stackId: "deleted-stack" })).stackId
    ).toBe(null)
  })

  it("prunes remembered entries by the same rules", () => {
    const pruned = pruneUnknownIds(
      persistedConfig({
        remembered: {
          [GONE_SKILL]: skillEntry(),
          [KNOWN_SKILL]: skillEntry({
            assignments: {
              [KNOWN_AGENT]: liveAssignment(),
              [GONE_AGENT]: liveAssignment(),
            },
          }),
        },
      })
    )

    expect(Object.keys(pruned.remembered)).toStrictEqual([KNOWN_SKILL])
    expect(pruned.remembered[KNOWN_SKILL]!.assignments).toStrictEqual({
      [KNOWN_AGENT]: liveAssignment(),
    })
  })
})

// No migrations: an old version is discarded, not upgraded.
describe("migrateConfig", () => {
  const sink = {
    issue: vi.fn<ReportingSink["issue"]>(),
    error: vi.fn<ReportingSink["error"]>(),
  }

  beforeEach(() => {
    setReportingSink(sink)
  })

  it("passes the current version through unchanged", () => {
    const current = persistedConfig({ skills: { [KNOWN_SKILL]: skillEntry() } })
    expect(migrateConfig(current, PERSIST_VERSION)).toStrictEqual(current)
    expect(sink.issue).not.toHaveBeenCalled()
  })

  it.each([
    ["an older version", { stackId: null, skills: {} }, PERSIST_VERSION - 1],
    ["an unknown future version", { stackId: null, skills: {} }, 99],
  ])("discards %s rather than guessing", (_label, state, version) => {
    expect(migrateConfig(state, version)).toBeUndefined()
  })

  // Version numbers only: a persisted blob is the user's own and none of it
  // may reach a report.
  it("reports the version it discarded", () => {
    migrateConfig({ stackId: null, skills: {} }, PERSIST_VERSION - 1)

    expect(sink.issue).toHaveBeenCalledWith(
      "Discarded saved configuration from another version",
      { fromVersion: PERSIST_VERSION - 1, persistVersion: PERSIST_VERSION }
    )
  })
})

describe("the model a sub-agent rests on", () => {
  it("is the one its own metadata names", () => {
    expect(restingAgentOptions(KNOWN_AGENT).model).toBe("opus")
  })

  it("is sonnet for a sub-agent whose metadata names none", () => {
    expect(restingAgentOptions("retired-agent").model).toBe("sonnet")
  })
})
