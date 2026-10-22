import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_CATALOG,
  cliMintedPayload,
  cliMintedStackPayload,
} from "@workspace/api-mocks"
import {
  CATALOG,
  MATRIX_VERSION,
  SEED_VERSION,
  STACKS,
  SUB_AGENTS_BY_ID,
  expandStack,
  installableSeedPayloadSchema,
  seedPayloadSchema,
  type SeedPayload,
} from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  externalSkillId,
  useCatalogStore,
  type ExternalSkill,
} from "@/stores/catalog-store"
import { stackSelection, useConfigStore } from "@/stores/config-store"
import {
  AGENT_MODELS,
  DEFAULT_SKILL_OPTIONS,
  isAgentOn,
  restingAgentOptions,
  type PersistedConfig,
} from "@/stores/persisted-schema"

import { isStackCustom } from "./derive"
import {
  adoptSeedPayload,
  fromSeedPayload,
  matchesSavedStack,
  recogniseStack,
  toSeedPayload,
  unknownPayloadIds,
} from "./seed"

const SKILL = Object.keys(CATALOG.skillsById)[0]!
const [AGENT, OTHER_AGENT] = Object.keys(SUB_AGENTS_BY_ID) as [string, string]
const STACK = STACKS[0]!.id
const GONE_AGENT = "retired-agent"
const PINNED_CODEX_MODEL = "gpt-5.6-terra" as const

const HOUSE_ID = externalSkillId(
  CATALOG.skillsById[SKILL]!.categoryId,
  "House React"
)
const HOUSE_SKILL: ExternalSkill = {
  id: HOUSE_ID,
  displayName: "House React",
  description: "The house React skill.",
  categoryId: CATALOG.skillsById[SKILL]!.categoryId,
  repo: "acme/skills",
  path: "skills/house-react",
  files: { "SKILL.md": "# House React\n", "metadata.yaml": "slug: house\n" },
}

// The seat is global, so a test that seats something puts it back.
afterEach(() => {
  useCatalogStore.getState().reset()
})

const config = (): PersistedConfig => ({
  stackId: STACK,
  skills: {
    [SKILL]: {
      ...DEFAULT_SKILL_OPTIONS,
      scope: "global",
      assignments: {
        [AGENT]: { load: "preloaded", enabled: true },
        // Switched off in the roster — must not leave the browser.
        [OTHER_AGENT]: { load: "lazy", enabled: false },
      },
    },
  },
  remembered: {
    [SKILL]: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
  },
  agents: { [AGENT]: { on: true } },
})

describe("toSeedPayload", () => {
  it("stamps the versioned envelope", () => {
    const payload = toSeedPayload(config())

    expect(payload.v).toBe(SEED_VERSION)
    expect(payload.matrixVersion).toBe(MATRIX_VERSION)
  })

  it("carries the selection through, minus disabled rows", () => {
    const payload = toSeedPayload(config())

    expect(payload.stackId).toBe(STACK)
    expect(payload.skills[SKILL]).toStrictEqual({
      ...DEFAULT_SKILL_OPTIONS,
      scope: "global",
      assignments: { [AGENT]: "preloaded" },
    })
  })

  it("leaves no model or effort on a skill", () => {
    const skill = toSeedPayload(config()).skills[SKILL]!

    expect(skill).not.toHaveProperty("model")
    expect(skill).not.toHaveProperty("effort")
  })

  it("never lets remembered ride along", () => {
    expect(toSeedPayload(config())).not.toHaveProperty("remembered")
  })

  it("names no marketplace while the seat rests on the public catalogue", () => {
    expect(toSeedPayload(config())).not.toHaveProperty("marketplace")
  })

  // The canonical ref is the only form production seats.
  it("names the marketplace the loaded catalogue came from", () => {
    useCatalogStore
      .getState()
      .load(MARKETPLACE_CATALOG, MARKETPLACE_CANONICAL_REF)

    const payload = toSeedPayload(config())

    expect(payload.marketplace).toBe(MARKETPLACE_CANONICAL_REF)
    expect(payload.matrixVersion).toBe(MARKETPLACE_CATALOG.version)

    useCatalogStore.getState().reset()
  })

  it("produces what the worker will validate against", () => {
    expect(seedPayloadSchema.safeParse(toSeedPayload(config())).success).toBe(
      true
    )
  })

  it("travels a pinned agent as on, bare or not", () => {
    const bare = { ...config(), skills: {} }

    expect(toSeedPayload(bare).agents).toStrictEqual({ [AGENT]: { on: true } })
    expect(toSeedPayload(config()).agents).toStrictEqual({
      [AGENT]: { on: true },
    })
  })

  it("omits a pinned-off agent entirely, rows included", () => {
    const pinnedOff = {
      ...config(),
      agents: { [AGENT]: { on: false, model: "haiku" as const } },
    }

    const payload = toSeedPayload(pinnedOff)

    expect(payload.agents).toStrictEqual({})
    expect(payload.skills[SKILL]!.assignments).toStrictEqual({})
    expect(fromSeedPayload(payload).skills[SKILL]!.assignments).toStrictEqual(
      {}
    )
  })

  // The payload must describe what is on screen, errors included.
  it("carries a row the two scopes rule out rather than stripping it", () => {
    const projectSkill = {
      ...config(),
      skills: {
        [SKILL]: { ...config().skills[SKILL]!, scope: "project" as const },
      },
    }

    expect(
      toSeedPayload(projectSkill).skills[SKILL]!.assignments
    ).toStrictEqual({
      [AGENT]: "preloaded",
    })
  })

  // Lenient on purpose; `createSharedConfig` enforces the write contract.
  it("mints a payload the write contract would refuse", () => {
    const projectSkill = {
      ...config(),
      skills: {
        [SKILL]: { ...config().skills[SKILL]!, scope: "project" as const },
      },
    }

    const payload = toSeedPayload(projectSkill)

    expect(seedPayloadSchema.safeParse(payload).success).toBe(true)
    expect(installableSeedPayloadSchema.safeParse(payload).success).toBe(false)
  })

  it("carries it once the sub-agent is pinned to the project too", () => {
    const bothProject = {
      ...config(),
      skills: {
        [SKILL]: { ...config().skills[SKILL]!, scope: "project" as const },
      },
      agents: { [AGENT]: { on: true, scope: "project" as const } },
    }

    expect(toSeedPayload(bothProject).skills[SKILL]!.assignments).toStrictEqual(
      {
        [AGENT]: "preloaded",
      }
    )
  })

  it("travels a derived-on agent's overrides without a pin", () => {
    const chosen = {
      ...config(),
      agents: { [AGENT]: { model: "haiku" as const, effort: "max" as const } },
    }

    const agent = toSeedPayload(chosen).agents[AGENT]!

    expect(agent).toStrictEqual({ model: "haiku", effort: "max" })
    expect(agent).not.toHaveProperty("on")
  })

  it("travels an agent's scope without touching the skill's", () => {
    const pinned = {
      ...config(),
      agents: { [AGENT]: { scope: "project" as const } },
    }

    const payload = toSeedPayload(pinned)

    expect(payload.agents[AGENT]).toStrictEqual({ scope: "project" })
    expect(payload.skills[SKILL]!.scope).toBe("global")
  })

  it("gives an agent left at the resting scope no scope key", () => {
    const resting = {
      ...config(),
      agents: { [AGENT]: { model: "haiku" as const } },
    }

    expect(toSeedPayload(resting).agents[AGENT]).not.toHaveProperty("scope")
  })

  it("gives an agent with nothing to say no entry at all", () => {
    const quiet = { ...config(), agents: {} }

    expect(toSeedPayload(quiet).agents).toStrictEqual({})
    // OTHER_AGENT holds only a switched-off row, so it is silent either way.
    expect(Object.keys(toSeedPayload(config()).agents)).toStrictEqual([AGENT])
  })

  it("does not mutate the store state it reads", () => {
    const before = config()
    toSeedPayload(before)
    expect(before).toStrictEqual(config())
  })
})

describe("fromSeedPayload", () => {
  it("round-trips the live assignments as enabled", () => {
    const restored = fromSeedPayload(toSeedPayload(config()))

    expect(restored.stackId).toBe(STACK)
    expect(restored.skills[SKILL]).toStrictEqual({
      ...DEFAULT_SKILL_OPTIONS,
      scope: "global",
      assignments: { [AGENT]: { load: "preloaded", enabled: true } },
    })
  })

  it("round-trips the agents map", () => {
    const chosen = {
      ...config(),
      agents: {
        [AGENT]: {
          on: true,
          model: "haiku" as const,
          scope: "global" as const,
        },
        [OTHER_AGENT]: { effort: "low" as const },
      },
    }

    expect(fromSeedPayload(toSeedPayload(chosen)).agents).toStrictEqual({
      [AGENT]: { on: true, model: "haiku", scope: "global" },
      [OTHER_AGENT]: { effort: "low" },
    })
  })

  it("restores an absent scope as absent, not spelled out", () => {
    const restored = fromSeedPayload(toSeedPayload(config()))

    expect(restored.agents[AGENT]).not.toHaveProperty("scope")
  })

  it("starts remembered empty", () => {
    expect(fromSeedPayload(toSeedPayload(config())).remembered).toStrictEqual(
      {}
    )
  })

  it("prunes ids the catalog does not know", () => {
    const payload = toSeedPayload(config())
    const drifted = {
      ...payload,
      stackId: "retired-stack",
      skills: {
        ...payload.skills,
        "skill-from-the-future": {
          ...payload.skills[SKILL]!,
          assignments: {},
        },
      },
    }

    const restored = fromSeedPayload(drifted)

    expect(restored.stackId).toBe(null)
    expect(Object.keys(restored.skills)).toStrictEqual([SKILL])
  })

  it("keeps an assignment the two scopes rule out rather than dropping it", () => {
    const payload = toSeedPayload(config())
    const shared = {
      ...payload,
      skills: {
        [SKILL]: {
          ...payload.skills[SKILL]!,
          scope: "project" as const,
          assignments: { [AGENT]: "preloaded" as const },
        },
      },
      agents: {},
    }

    expect(fromSeedPayload(shared).skills[SKILL]!.assignments).toStrictEqual({
      [AGENT]: { load: "preloaded", enabled: true },
    })
  })

  it("prunes an agent the catalog no longer has", () => {
    const payload = toSeedPayload(config())
    const drifted = {
      ...payload,
      agents: { ...payload.agents, [GONE_AGENT]: { model: "haiku" as const } },
    }

    expect(Object.keys(fromSeedPayload(drifted).agents)).toStrictEqual([AGENT])
  })

  // As `init --from` installs it: a sub-agent never depends on a skill loading.
  describe("a sub-agent only a skill the catalog does not know reached", () => {
    const UNKNOWN_SKILL = "skill-from-the-future"

    const reachedOnlyByUnknown = (agents: SeedPayload["agents"] = {}) => {
      const payload = toSeedPayload(config())
      return {
        ...payload,
        skills: {
          ...payload.skills,
          [UNKNOWN_SKILL]: {
            ...payload.skills[SKILL]!,
            assignments: { [OTHER_AGENT]: "lazy" as const },
          },
        },
        agents: { ...payload.agents, ...agents },
      }
    }

    it("stays on without it", () => {
      expect(
        isAgentOn(fromSeedPayload(reachedOnlyByUnknown()), OTHER_AGENT)
      ).toBe(true)
    })

    it("travels on the next mint", () => {
      const restored = fromSeedPayload(reachedOnlyByUnknown())

      expect(toSeedPayload(restored).agents[OTHER_AGENT]).toStrictEqual({
        on: true,
      })
    })

    it("stays off when the payload switches it off", () => {
      const restored = fromSeedPayload(
        reachedOnlyByUnknown({ [OTHER_AGENT]: { on: false } })
      )

      expect(isAgentOn(restored, OTHER_AGENT)).toBe(false)
    })

    it("keeps its other choices", () => {
      const restored = fromSeedPayload(
        reachedOnlyByUnknown({ [OTHER_AGENT]: { model: "haiku" } })
      )

      expect(restored.agents[OTHER_AGENT]).toStrictEqual({
        on: true,
        model: "haiku",
      })
    })

    it("gains no pin when a skill the catalog knows reaches it too", () => {
      const payload = reachedOnlyByUnknown()
      const alsoReachedByKnown = {
        ...payload,
        skills: {
          ...payload.skills,
          [UNKNOWN_SKILL]: {
            ...payload.skills[UNKNOWN_SKILL],
            assignments: { [AGENT]: "lazy" as const },
          },
        },
        agents: {},
      }

      expect(fromSeedPayload(alsoReachedByKnown).agents).toStrictEqual({})
    })

    it("is not invented for an agent the catalog does not have", () => {
      const payload = reachedOnlyByUnknown()
      const restored = fromSeedPayload({
        ...payload,
        skills: {
          ...payload.skills,
          [UNKNOWN_SKILL]: {
            ...payload.skills[UNKNOWN_SKILL],
            assignments: { [GONE_AGENT]: "lazy" as const },
          },
        },
      })

      expect(restored.agents).not.toHaveProperty(GONE_AGENT)
    })
  })
})

// The wire field is a string, so an id this editor does not offer is dropped.
describe("the Codex model on the wire", () => {
  it("travels beside the Claude model rather than replacing it", () => {
    const pinned = {
      ...config(),
      agents: {
        [AGENT]: {
          on: true,
          model: "haiku" as const,
          codexModel: PINNED_CODEX_MODEL,
        },
      },
    }

    expect(toSeedPayload(pinned).agents[AGENT]).toStrictEqual({
      on: true,
      model: "haiku",
      codexModel: PINNED_CODEX_MODEL,
    })
  })

  it("travels on an agent with nothing else to say", () => {
    const pinned = {
      ...config(),
      agents: { [AGENT]: { codexModel: PINNED_CODEX_MODEL } },
    }

    expect(toSeedPayload(pinned).agents).toStrictEqual({
      [AGENT]: { codexModel: PINNED_CODEX_MODEL },
    })
  })

  it("round-trips", () => {
    const pinned = {
      ...config(),
      agents: {
        [AGENT]: { on: true, codexModel: PINNED_CODEX_MODEL },
        [OTHER_AGENT]: {
          model: "haiku" as const,
          codexModel: "gpt-5.6-luna" as const,
        },
      },
    }

    expect(fromSeedPayload(toSeedPayload(pinned)).agents).toStrictEqual(
      pinned.agents
    )
  })

  it("keeps an offered id and drops one this editor does not offer", () => {
    const arriving = {
      ...toSeedPayload(config()),
      agents: {
        [AGENT]: { on: true, codexModel: PINNED_CODEX_MODEL },
        [OTHER_AGENT]: { model: "haiku" as const, codexModel: "gpt-4o" },
      },
    }

    expect(fromSeedPayload(arriving).agents).toStrictEqual({
      [AGENT]: { on: true, codexModel: PINNED_CODEX_MODEL },
      [OTHER_AGENT]: { model: "haiku" },
    })
  })

  // Absence is `inherit`.
  it("never sends inherit for an agent resting on it", () => {
    const resting = {
      ...config(),
      agents: {
        [AGENT]: {
          on: true,
          effort: "max" as const,
          codexModel: "inherit" as const,
        },
      },
    }

    expect(toSeedPayload(resting).agents[AGENT]).toStrictEqual({
      on: true,
      effort: "max",
    })
  })
})

describe("unknownPayloadIds", () => {
  it("names nothing when the catalogue placed every id", () => {
    const payload = toSeedPayload(config())

    expect(unknownPayloadIds(payload, fromSeedPayload(payload))).toStrictEqual(
      []
    )
  })

  it("names a skill this catalogue does not carry", () => {
    const payload = toSeedPayload(config())
    const drifted = {
      ...payload,
      skills: {
        ...payload.skills,
        "skill-from-the-future": { ...payload.skills[SKILL]!, assignments: {} },
      },
    }

    expect(unknownPayloadIds(drifted, fromSeedPayload(drifted))).toStrictEqual([
      "skill-from-the-future",
    ])
  })

  it("names an agent the roster has retired", () => {
    const payload = toSeedPayload(config())
    const drifted = {
      ...payload,
      agents: { ...payload.agents, [GONE_AGENT]: { model: "haiku" as const } },
    }

    expect(unknownPayloadIds(drifted, fromSeedPayload(drifted))).toStrictEqual([
      GONE_AGENT,
    ])
  })

  it("names the stack when it did not survive", () => {
    const payload = { ...toSeedPayload(config()), stackId: "retired-stack" }

    expect(unknownPayloadIds(payload, fromSeedPayload(payload))).toStrictEqual([
      "retired-stack",
    ])
  })

  it("says nothing about a skill the payload's own content registered", () => {
    useCatalogStore.getState().addExternal([HOUSE_SKILL])
    const payload = toSeedPayload({
      stackId: null,
      skills: {
        [HOUSE_ID]: { install: "eject", scope: "project", assignments: {} },
      },
      agents: {},
    })
    useCatalogStore.getState().reset()

    expect(unknownPayloadIds(payload, adoptSeedPayload(payload))).toStrictEqual(
      []
    )
  })
})

// External skills travel inline, so `--from` reaches no third-party repository.
describe("external skills in the payload", () => {
  const externalConfig = (): PersistedConfig => ({
    stackId: null,
    skills: {
      [HOUSE_ID]: {
        install: "eject",
        scope: "project",
        assignments: { [AGENT]: { load: "lazy", enabled: true } },
      },
    },
    remembered: {},
    agents: {},
  })

  beforeEach(() => {
    useCatalogStore.getState().addExternal([HOUSE_SKILL])
  })

  it("carries the whole directory beside the selection", () => {
    const payload = toSeedPayload(externalConfig())

    expect(payload.external?.[HOUSE_ID]?.files).toStrictEqual(HOUSE_SKILL.files)
  })

  it("carries the confirmed category, so the receiver places it as we did", () => {
    const payload = toSeedPayload(externalConfig())

    expect(payload.external?.[HOUSE_ID]?.categoryId).toBe(
      HOUSE_SKILL.categoryId
    )
  })

  it("names where it came from, so it can be read at its source", () => {
    const carried = toSeedPayload(externalConfig()).external?.[HOUSE_ID]

    expect(carried?.repo).toBe(HOUSE_SKILL.repo)
    expect(carried?.path).toBe(HOUSE_SKILL.path)
  })

  it("leaves out an added skill the selection does not name", () => {
    expect(toSeedPayload(config())).not.toHaveProperty("external")
  })

  it("produces what the worker will validate against", () => {
    expect(
      seedPayloadSchema.safeParse(toSeedPayload(externalConfig())).success
    ).toBe(true)
  })

  it("survives the round trip rather than pruning on arrival", () => {
    const payload = toSeedPayload(externalConfig())
    useCatalogStore.getState().reset()

    expect(adoptSeedPayload(payload).skills[HOUSE_ID]).toBeDefined()
  })

  it("restores the skill to the catalogue, content and all", () => {
    const payload = toSeedPayload(externalConfig())
    useCatalogStore.getState().reset()

    adoptSeedPayload(payload)

    expect(useCatalogStore.getState().skillById(HOUSE_ID)?.displayName).toBe(
      HOUSE_SKILL.displayName
    )
    expect(useCatalogStore.getState().external[HOUSE_ID]?.files).toStrictEqual(
      HOUSE_SKILL.files
    )
  })

  it("keeps the skills already added when a payload names none", () => {
    adoptSeedPayload(toSeedPayload(config()))

    expect(useCatalogStore.getState().external[HOUSE_ID]).toBeDefined()
  })
})

describe("matchesSavedStack", () => {
  const saved = () => toSeedPayload(config())

  it("says yes to the selection it was taken from", () => {
    expect(matchesSavedStack(config(), saved())).toBe(true)
  })

  it("says yes to what the snapshot restores", () => {
    expect(matchesSavedStack(fromSeedPayload(saved()), saved())).toBe(true)
  })

  it("says no once the selection moves off it", () => {
    const edited = {
      ...config(),
      agents: { [AGENT]: { on: true, model: "haiku" as const } },
    }

    expect(matchesSavedStack(edited, saved())).toBe(false)
  })

  it("says no once only the Codex model moves off it", () => {
    const repinned = {
      ...config(),
      agents: { [AGENT]: { on: true, codexModel: PINNED_CODEX_MODEL } },
    }

    expect(matchesSavedStack(repinned, saved())).toBe(false)
  })

  it("says no when the slot is empty", () => {
    expect(matchesSavedStack(config(), null)).toBe(false)
  })

  // No stack id, another matrix version, every sub-agent spelled out at rest.
  it("says yes to the same selection as the CLI mints it", () => {
    const minted = cliMintedPayload({
      [SKILL]: {
        ...DEFAULT_SKILL_OPTIONS,
        scope: "global",
        assignments: { [AGENT]: "preloaded" },
      },
    })

    expect(matchesSavedStack(config(), minted)).toBe(true)
  })

  it("says no to the same selection saved on another marketplace", () => {
    const elsewhere = { ...saved(), marketplace: MARKETPLACE_CANONICAL_REF }

    expect(matchesSavedStack(config(), elsewhere)).toBe(false)
  })
})

// The CLI mints with `stackId: null`, so the stack is recognised by contents.
describe("recogniseStack", () => {
  // Pins a sub-agent no skill reaches, so the roster is compared as well as
  // the skills.
  const STACK_WITH_PINS = STACKS.find(
    (stack) => (expandStack(stack.id)?.skillLessAgentIds.length ?? 0) > 0
  )!.id
  const PINNED_AGENT = expandStack(STACK_WITH_PINS)!.skillLessAgentIds[0]!
  const OUTSIDE_SKILL = Object.keys(CATALOG.skillsById).find(
    (skillId) => !expandStack(STACK_WITH_PINS)!.skillIds.includes(skillId)
  )!
  // One the stack's skills switch on, so tuning it moves nothing else.
  const TUNED_AGENT = Object.values(
    expandStack(STACK_WITH_PINS)!.assignmentsBySkill
  ).flat()[0]!.agentId
  const RESTING = restingAgentOptions(TUNED_AGENT)
  const OTHER_MODEL = AGENT_MODELS.find((model) => model !== RESTING.model)!

  const opened = (payload: SeedPayload) =>
    recogniseStack(payload, fromSeedPayload(payload))

  const minted = () => cliMintedStackPayload(STACK_WITH_PINS)

  const withTunedAgent = (tuning: SeedPayload["agents"][string]) => ({
    ...minted(),
    agents: { ...minted().agents, [TUNED_AGENT]: tuning },
  })

  it("opens a link the CLI minted from a stack as that stack, applied", () => {
    expect(opened(minted())).toStrictEqual(stackSelection(STACK_WITH_PINS))
  })

  it("leaves nothing to lose on the stack it opened", () => {
    expect(isStackCustom(opened(minted()))).toBe(false)
  })

  it("opens one skill more than the stack on Start from scratch", () => {
    const payload = {
      ...minted(),
      skills: {
        ...minted().skills,
        [OUTSIDE_SKILL]: {
          ...DEFAULT_SKILL_OPTIONS,
          assignments: {},
        },
      },
    }

    expect(opened(payload)).toStrictEqual(fromSeedPayload(payload))
  })

  it("opens on Start from scratch without a sub-agent the stack switches on", () => {
    const { [PINNED_AGENT]: _left, ...agents } = minted().agents
    const payload = { ...minted(), agents }

    expect(opened(payload)).toStrictEqual(fromSeedPayload(payload))
  })

  it("opens a sub-agent tuned away from rest on Start from scratch", () => {
    const payload = withTunedAgent({
      on: true,
      scope: RESTING.scope,
      model: OTHER_MODEL,
    })

    expect(opened(payload)).toStrictEqual(fromSeedPayload(payload))
  })

  it("reads a choice spelled out at its resting value as no choice", () => {
    const payload = withTunedAgent({
      on: true,
      scope: RESTING.scope,
      model: RESTING.model,
      effort: RESTING.effort,
    })

    expect(opened(payload)).toStrictEqual(stackSelection(STACK_WITH_PINS))
  })

  it("keeps the description the link arrived with", () => {
    const DESCRIPTION = "The house web app, as installed."

    expect(opened({ ...minted(), description: DESCRIPTION })).toStrictEqual({
      ...stackSelection(STACK_WITH_PINS),
      description: DESCRIPTION,
    })
  })

  it("leaves a link that names a stack on the stack it names", () => {
    const other = STACKS.find((stack) => stack.id !== STACK_WITH_PINS)!.id
    const payload = { ...minted(), stackId: other }

    expect(opened(payload)).toStrictEqual(fromSeedPayload(payload))
  })
})

// `init --from` writes it; a bare `edit` mints it back.
describe("the description a configuration arrived with", () => {
  const DESCRIPTION = "The house web app, as installed."

  afterEach(() => {
    useConfigStore.getState().reset()
  })

  const described = () => ({
    ...toSeedPayload(config()),
    description: DESCRIPTION,
  })

  it("is kept on adoption", () => {
    expect(fromSeedPayload(described()).description).toBe(DESCRIPTION)
  })

  it("travels on the next mint", () => {
    useConfigStore.getState().importConfig(fromSeedPayload(described()))

    expect(toSeedPayload(useConfigStore.getState()).description).toBe(
      DESCRIPTION
    )
  })

  it("is not invented for a configuration that arrived without one", () => {
    useConfigStore
      .getState()
      .importConfig(fromSeedPayload(toSeedPayload(config())))

    expect(toSeedPayload(useConfigStore.getState())).not.toHaveProperty(
      "description"
    )
  })
})

// `inherit` never leaves the browser, so an entry holding only it says nothing.
describe("an agent whose only choice is one the wire leaves out", () => {
  it("travels no entry for it", () => {
    const inheritOnly = {
      ...config(),
      agents: { [AGENT]: { codexModel: "inherit" as const } },
    }

    expect(toSeedPayload(inheritOnly).agents).toStrictEqual({})
  })
})
