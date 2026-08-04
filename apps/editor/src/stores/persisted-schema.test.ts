import { CATALOG, STACKS, SUB_AGENTS_BY_ID } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
  isAgentOn,
  isWorthRemembering,
  migrateConfig,
  persistedConfigSchema,
  pruneUnknownIds,
  type PersistedConfig,
  type SkillEntry,
} from "./persisted-schema"

// localStorage is the one genuinely untrusted input the app has, and this
// module is the boundary that reads it. A bug here is *silent*: nothing
// throws, the app quietly hands back a configuration missing the work someone
// spent an afternoon on.
//
// Reaching these paths through the browser means hand-seeding storage and
// reloading, which is slow and awkward for one case and impractical for a
// dozen — so they are covered here instead.

const KNOWN_SKILL = Object.keys(CATALOG.skillsById)[0]!
const KNOWN_AGENT = Object.keys(SUB_AGENTS_BY_ID)[0]!
const KNOWN_STACK = STACKS[0]!.id
const GONE_SKILL = "removed-in-a-later-release"
const GONE_AGENT = "retired-agent"

const LIVE = { load: "lazy", enabled: true } as const
const PRE = { load: "preloaded", enabled: true } as const
const OFF = { load: "preloaded", enabled: false } as const

const entry = (over: Partial<SkillEntry> = {}): SkillEntry => ({
  ...DEFAULT_SKILL_OPTIONS,
  assignments: {},
  ...over,
})

const config = (over: Partial<PersistedConfig> = {}): PersistedConfig => ({
  stackId: null,
  skills: {},
  remembered: {},
  agents: {},
  ...over,
})

// v7 moved model and effort off the skill and onto the agent, and replaced the
// boolean `pins` map with one record per agent. v8 gave that record a fourth
// decision: the scope the agent's front-matter is written into.
describe("PERSIST_VERSION", () => {
  it("is 8", () => {
    expect(PERSIST_VERSION).toBe(8)
  })
})

describe("persistedConfigSchema", () => {
  // Assembled raw rather than through `config()`: a v7 skill cannot be *typed*
  // with a model any more, and a stale blob out of localStorage is `unknown`
  // anyway — which is exactly the input the stripping has to survive.
  it("no longer keeps a model or an effort on a skill", () => {
    const parsed = persistedConfigSchema.parse({
      ...config(),
      skills: {
        [KNOWN_SKILL]: { ...entry(), model: "opus", effort: "max" },
      },
    })

    expect(parsed.skills[KNOWN_SKILL]).not.toHaveProperty("model")
    expect(parsed.skills[KNOWN_SKILL]).not.toHaveProperty("effort")
  })

  // Every field is optional and the record is sparse, so "on with no model" and
  // "a model on an agent nobody has pinned" are both sayable.
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
      config({ agents: { [KNOWN_AGENT]: agent } })
    )

    expect(parsed.success).toBe(true)
  })

  // Located on the agent, not merely rejected: the whole config is otherwise
  // valid, so the complaint has to name the field that is wrong. Raw again —
  // neither value is a sayable `AgentEntry`, which is the point.
  it.each([
    ["a model the CLI does not offer", { model: "gpt" }],
    ["an effort level that does not exist", { effort: "ultra" }],
    ["a scope that is nowhere the CLI writes", { scope: "user" }],
  ])("refuses %s", (_label, agent) => {
    const parsed = persistedConfigSchema.safeParse({
      ...config(),
      agents: { [KNOWN_AGENT]: agent },
    })

    expect(parsed.success).toBe(false)
    expect(
      parsed.error?.issues.map((issue) => issue.path.join("."))
    ).toContainEqual(expect.stringContaining(`agents.${KNOWN_AGENT}`))
  })

  // Pre-release policy is discard-don't-migrate, and the version seam does that
  // first — but a v6 blob that reached the parser must not half-load either.
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

describe("isWorthRemembering", () => {
  it("drops an entry carrying no decisions", () => {
    expect(isWorthRemembering(entry())).toBe(false)
  })

  // Model and effort were two of the four signals here and are gone: an entry
  // now says something only through its assignments or its install options.
  it.each([
    ["a non-default install mode", { install: "eject" as const }],
    ["a non-default scope", { scope: "global" as const }],
  ])("keeps an entry with %s", (_label, over) => {
    expect(isWorthRemembering(entry(over))).toBe(true)
  })

  // The case the guard exists for. A stack — or the auto-assignment rule —
  // hands a skill its assignments without the user clicking anything, and
  // losing those to a stray toggle is exactly as costly as hand-built ones.
  it("keeps a stack-provided entry whose only content is assignments", () => {
    const stackProvided = entry({ assignments: { [KNOWN_AGENT]: PRE } })

    expect(stackProvided).toMatchObject(DEFAULT_SKILL_OPTIONS)
    expect(isWorthRemembering(stackProvided)).toBe(true)
  })

  // A switched-off row is still a decision — restoring it recessed is the
  // whole point of keeping it, so it counts as content.
  it("keeps an entry whose only content is disabled rows", () => {
    expect(
      isWorthRemembering(entry({ assignments: { [KNOWN_AGENT]: OFF } }))
    ).toBe(true)
  })
})

describe("isAgentOn", () => {
  it("is off with no skills and no pin", () => {
    expect(isAgentOn(config(), KNOWN_AGENT)).toBe(false)
  })

  it("derives on from holding an enabled skill", () => {
    const holding = config({
      skills: {
        [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: LIVE } }),
      },
    })

    expect(isAgentOn(holding, KNOWN_AGENT)).toBe(true)
  })

  it("stays off when its only assignment is disabled", () => {
    const disabled = config({
      skills: { [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: OFF } }) },
    })

    expect(isAgentOn(disabled, KNOWN_AGENT)).toBe(false)
  })

  it("lets a pin override the derived state in both directions", () => {
    const holding = config({
      skills: {
        [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: LIVE } }),
      },
      agents: { [KNOWN_AGENT]: { on: false } },
    })
    const bare = config({ agents: { [KNOWN_AGENT]: { on: true } } })

    expect(isAgentOn(holding, KNOWN_AGENT)).toBe(false)
    expect(isAgentOn(bare, KNOWN_AGENT)).toBe(true)
  })

  // The record is where model and effort live too, so an agent can have an
  // entry without anyone having pinned it. Tri-state, not boolean: only an
  // explicit `on` decides; absent still means "ask the assignments".
  it("ignores an entry that names no pin", () => {
    const chosen = { model: "haiku" as const, effort: "max" as const }

    expect(
      isAgentOn(config({ agents: { [KNOWN_AGENT]: chosen } }), KNOWN_AGENT)
    ).toBe(false)
    expect(
      isAgentOn(
        config({
          skills: {
            [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: LIVE } }),
          },
          agents: { [KNOWN_AGENT]: chosen },
        }),
        KNOWN_AGENT
      )
    ).toBe(true)
  })

  // `on: false` is a decision, and `undefined` is the absence of one — a
  // boolean read would collapse the two and switch every pinned-off agent on.
  it("keeps a pinned-off agent off while it carries a model", () => {
    const pinnedOff = config({
      skills: {
        [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: LIVE } }),
      },
      agents: { [KNOWN_AGENT]: { on: false, model: "haiku" } },
    })

    expect(isAgentOn(pinnedOff, KNOWN_AGENT)).toBe(false)
  })
})

describe("pruneUnknownIds", () => {
  it("keeps everything the catalog still knows", () => {
    const kept = config({
      stackId: KNOWN_STACK,
      skills: {
        [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: LIVE } }),
      },
      agents: { [KNOWN_AGENT]: { on: true, model: "haiku" } },
    })

    expect(pruneUnknownIds(kept)).toEqual(kept)
  })

  it("drops a skill the catalog no longer has", () => {
    const pruned = pruneUnknownIds(
      config({ skills: { [KNOWN_SKILL]: entry(), [GONE_SKILL]: entry() } })
    )

    expect(Object.keys(pruned.skills)).toEqual([KNOWN_SKILL])
  })

  it("drops a retired sub-agent from inside assignments", () => {
    const pruned = pruneUnknownIds(
      config({
        skills: {
          [KNOWN_SKILL]: entry({
            assignments: { [KNOWN_AGENT]: LIVE, [GONE_AGENT]: PRE },
          }),
        },
      })
    )

    expect(pruned.skills[KNOWN_SKILL]!.assignments).toEqual({
      [KNOWN_AGENT]: LIVE,
    })
  })

  it("drops a retired sub-agent's own record", () => {
    const pruned = pruneUnknownIds(
      config({
        agents: {
          [KNOWN_AGENT]: { on: true },
          [GONE_AGENT]: { on: false, model: "haiku" },
        },
      })
    )

    expect(pruned.agents).toEqual({ [KNOWN_AGENT]: { on: true } })
  })

  it("falls back to no stack when the stack is gone", () => {
    expect(pruneUnknownIds(config({ stackId: "deleted-stack" })).stackId).toBe(
      null
    )
  })

  // The map added in v3 is just as exposed to catalogue drift as `skills`.
  it("prunes remembered entries by the same rules", () => {
    const pruned = pruneUnknownIds(
      config({
        remembered: {
          [GONE_SKILL]: entry(),
          [KNOWN_SKILL]: entry({
            assignments: { [KNOWN_AGENT]: LIVE, [GONE_AGENT]: LIVE },
          }),
        },
      })
    )

    expect(Object.keys(pruned.remembered)).toEqual([KNOWN_SKILL])
    expect(pruned.remembered[KNOWN_SKILL]!.assignments).toEqual({
      [KNOWN_AGENT]: LIVE,
    })
  })
})

// Pre-release policy: no migrations — an old version is discarded, not upgraded.
describe("migrateConfig", () => {
  it("passes the current version through unchanged", () => {
    const current = config({ skills: { [KNOWN_SKILL]: entry() } })
    expect(migrateConfig(current, PERSIST_VERSION)).toEqual(current)
  })

  it.each([
    ["an older version", { stackId: null, skills: {} }, PERSIST_VERSION - 1],
    ["an unknown future version", { stackId: null, skills: {} }, 99],
  ])("discards %s rather than guessing", (_label, state, version) => {
    expect(migrateConfig(state, version)).toBeUndefined()
  })
})
