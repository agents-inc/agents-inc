import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_CATALOG,
} from "@workspace/api-mocks"
import {
  CATALOG,
  MATRIX_VERSION,
  SEED_VERSION,
  STACKS,
  SUB_AGENTS_BY_ID,
  installableSeedPayloadSchema,
  seedPayloadSchema,
} from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  externalSkillId,
  useCatalogStore,
  type ExternalSkill,
} from "@/stores/catalog-store"
import {
  DEFAULT_SKILL_OPTIONS,
  type PersistedConfig,
} from "@/stores/persisted-schema"

import {
  adoptSeedPayload,
  fromSeedPayload,
  matchesSavedStack,
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
})
