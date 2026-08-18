import { MARKETPLACE_CATALOG, MARKETPLACE_REF } from "@workspace/api-mocks"
import {
  CATALOG,
  MATRIX_VERSION,
  SEED_VERSION,
  STACKS,
  SUB_AGENTS_BY_ID,
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

// The payload is what leaves the browser, so what matters here is the boundary:
// the envelope is stamped, the selection passes through, and nothing that
// should stay local can ride along.
//
// v2 moved model and effort off the skill and onto the agent, which gave the
// payload a second map. That map is not a copy of the store's: it carries only
// what an agent has to say, and a pinned-off agent says nothing at all.

const SKILL = Object.keys(CATALOG.skillsById)[0]!
const [AGENT, OTHER_AGENT] = Object.keys(SUB_AGENTS_BY_ID) as [string, string]
const STACK = STACKS[0]!.id
const GONE_AGENT = "retired-agent"

// The skill someone added from outside the catalogue, filed under a category
// the catalogue really ships — which is what a real catalogue entry means.
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

// The seat is global, so a test that seats a marketplace or an external skill
// has to put it back — otherwise the next file's catalogue is this one's.
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

  // The wire keeps assignments as agent → load, presence meaning "live", so the
  // store's `{ load, enabled }` flattens to only its enabled rows — and a skill
  // now carries where it installs and nothing about how anyone thinks.
  it("carries the selection through, minus disabled rows", () => {
    const payload = toSeedPayload(config())

    expect(payload.stackId).toBe(STACK)
    expect(payload.skills[SKILL]).toEqual({
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

  // A full store state is a valid ConfigSelection, so nothing stops a caller
  // passing one; the contract, not the caller, is what keeps `remembered` home.
  it("never lets remembered ride along", () => {
    expect(toSeedPayload(config())).not.toHaveProperty("remembered")
  })

  // v4's field, and what it means is decided by the seated catalogue. Absent is
  // the public one — every payload the editor has ever minted — so a payload
  // built on it looks exactly as it did before the field existed. Only a loaded
  // marketplace names one, and it has to: the ids in `skills` are that
  // marketplace's, and without the ref `--from` would install the receiver's
  // own same-named skills instead.
  it("names no marketplace while the seat rests on the public catalogue", () => {
    expect(toSeedPayload(config())).not.toHaveProperty("marketplace")
  })

  it("names the marketplace the loaded catalogue came from", () => {
    useCatalogStore.getState().load(MARKETPLACE_CATALOG, MARKETPLACE_REF)

    const payload = toSeedPayload(config())

    expect(payload.marketplace).toBe(MARKETPLACE_REF)
    // Stamped from the loaded catalogue too, so a receiver explaining skipped
    // ids is told which catalogue they were minted against.
    expect(payload.matrixVersion).toBe(MARKETPLACE_CATALOG.version)

    useCatalogStore.getState().reset()
  })

  it("produces what the worker will validate against", () => {
    expect(seedPayloadSchema.safeParse(toSeedPayload(config())).success).toBe(
      true
    )
  })

  // The capability v2 adds: `on: true` is sayable, so an agent with no skills
  // at all can travel. v1 inferred agents from assignments and could not.
  it("travels a pinned agent as on, bare or not", () => {
    const bare = { ...config(), skills: {} }

    expect(toSeedPayload(bare).agents).toEqual({ [AGENT]: { on: true } })
    expect(toSeedPayload(config()).agents).toEqual({ [AGENT]: { on: true } })
  })

  // A pinned-off agent renders recessed and is excluded from every count, so
  // neither it nor its rows may travel — presence on the wire means "installs".
  it("omits a pinned-off agent entirely, rows included", () => {
    const pinnedOff = {
      ...config(),
      agents: { [AGENT]: { on: false, model: "haiku" as const } },
    }

    const payload = toSeedPayload(pinnedOff)

    expect(payload.agents).toEqual({})
    expect(payload.skills[SKILL]!.assignments).toEqual({})
    expect(fromSeedPayload(payload).skills[SKILL]!.assignments).toEqual({})
  })

  // An agent switched on by its assignments is already implied by them, so
  // repeating `on` would be the one place the payload could contradict itself.
  it("travels a derived-on agent's overrides without a pin", () => {
    const chosen = {
      ...config(),
      agents: { [AGENT]: { model: "haiku" as const, effort: "max" as const } },
    }

    const agent = toSeedPayload(chosen).agents[AGENT]!

    expect(agent).toEqual({ model: "haiku", effort: "max" })
    expect(agent).not.toHaveProperty("on")
  })

  // v3's field. Scope is a decision about the agent exactly as its model is,
  // so it travels on the agent's entry — and the skill's own `scope`, which is
  // a different field with the same name, is left exactly as it was.
  it("travels an agent's scope without touching the skill's", () => {
    const pinned = {
      ...config(),
      agents: { [AGENT]: { scope: "project" as const } },
    }

    const payload = toSeedPayload(pinned)

    expect(payload.agents[AGENT]).toEqual({ scope: "project" })
    expect(payload.skills[SKILL]!.scope).toBe("global")
  })

  // The store drops a scope set back to the resting global, so the resting
  // value cannot reach the payload — and if it ever did, it would say what
  // absence already says. Nothing about that entry may travel.
  it("gives an agent left at the resting scope no scope key", () => {
    const resting = {
      ...config(),
      agents: { [AGENT]: { model: "haiku" as const } },
    }

    expect(toSeedPayload(resting).agents[AGENT]).not.toHaveProperty("scope")
  })

  // The map is sparse for the same reason the skill map is: an agent resting on
  // its catalogue model with medium effort and no pin has nothing to say.
  it("gives an agent with nothing to say no entry at all", () => {
    const quiet = { ...config(), agents: {} }

    expect(toSeedPayload(quiet).agents).toEqual({})
    // OTHER_AGENT holds only a switched-off row, so it is silent either way.
    expect(Object.keys(toSeedPayload(config()).agents)).toEqual([AGENT])
  })

  it("does not mutate the store state it reads", () => {
    const before = config()
    toSeedPayload(before)
    expect(before).toEqual(config())
  })
})

describe("fromSeedPayload", () => {
  it("round-trips the live assignments as enabled", () => {
    const restored = fromSeedPayload(toSeedPayload(config()))

    expect(restored.stackId).toBe(STACK)
    expect(restored.skills[SKILL]).toEqual({
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

    expect(fromSeedPayload(toSeedPayload(chosen)).agents).toEqual({
      [AGENT]: { on: true, model: "haiku", scope: "global" },
      [OTHER_AGENT]: { effort: "low" },
    })
  })

  // Absent means the resting global on both sides of the wire, so a restored
  // entry says nothing about scope rather than saying "global" out loud —
  // which is what keeps a round trip from growing keys the store would then
  // have to drop.
  it("restores an absent scope as absent, not spelled out", () => {
    const restored = fromSeedPayload(toSeedPayload(config()))

    expect(restored.agents[AGENT]).not.toHaveProperty("scope")
  })

  it("starts remembered empty", () => {
    expect(fromSeedPayload(toSeedPayload(config())).remembered).toEqual({})
  })

  // A payload can be minted against a matrix this catalog has moved past, so
  // unknown ids are skipped rather than failing the whole import.
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
    expect(Object.keys(restored.skills)).toEqual([SKILL])
  })

  // The agents map is as exposed to catalogue drift as the skills map, and it
  // is now the only place a retired agent can arrive without an assignment.
  it("prunes an agent the catalog no longer has", () => {
    const payload = toSeedPayload(config())
    const drifted = {
      ...payload,
      agents: { ...payload.agents, [GONE_AGENT]: { model: "haiku" as const } },
    }

    expect(Object.keys(fromSeedPayload(drifted).agents)).toEqual([AGENT])
  })
})

// Pruning is right — a configuration must not name skills nothing can install
// — but pruning in silence is what turns catalogue drift into a link that comes
// back quietly smaller than it was sent. This is the count that makes the
// difference sayable, and it is measured against what the import actually
// produced rather than against the catalogue, so it names exactly what was lost.
describe("unknownPayloadIds", () => {
  it("names nothing when the catalogue placed every id", () => {
    const payload = toSeedPayload(config())

    expect(unknownPayloadIds(payload, fromSeedPayload(payload))).toEqual([])
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

    expect(unknownPayloadIds(drifted, fromSeedPayload(drifted))).toEqual([
      "skill-from-the-future",
    ])
  })

  it("names an agent the roster has retired", () => {
    const payload = toSeedPayload(config())
    const drifted = {
      ...payload,
      agents: { ...payload.agents, [GONE_AGENT]: { model: "haiku" as const } },
    }

    expect(unknownPayloadIds(drifted, fromSeedPayload(drifted))).toEqual([
      GONE_AGENT,
    ])
  })

  // The stack is one id like any other, and losing it silently is how a link
  // arrives claiming to have been built from scratch.
  it("names the stack when it did not survive", () => {
    const payload = { ...toSeedPayload(config()), stackId: "retired-stack" }

    expect(unknownPayloadIds(payload, fromSeedPayload(payload))).toEqual([
      "retired-stack",
    ])
  })

  // An external skill's own content is what puts its id in the catalogue, so it
  // is known by the time the comparison runs — the ordering `adoptSeedPayload`
  // exists for, seen from the other end.
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

    expect(unknownPayloadIds(payload, adoptSeedPayload(payload))).toEqual([])
  })
})

// ── External skills ──────────────────────────────────────────────────────
//
// The half of the payload that carries CONTENT. Every other id in it is
// resolved by the receiver against a catalogue it already has; an external
// skill answers to no catalogue, so the ruling (owner, 2026-08-16) is that the
// editor resolves it and the bytes travel inline. What that buys is a
// self-contained id: `--from` reaches no third-party repository at install
// time, and two people installing one id get identical content.

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

  // Content is the expensive part of the payload, so an external skill nobody
  // picked has no business in it — the same sparseness that keeps a deselected
  // skill's setup out.
  it("leaves out an added skill the selection does not name", () => {
    expect(toSeedPayload(config())).not.toHaveProperty("external")
  })

  it("produces what the worker will validate against", () => {
    expect(
      seedPayloadSchema.safeParse(toSeedPayload(externalConfig())).success
    ).toBe(true)
  })

  // EDITOR-15 and EDITOR-16, from the receiving side. The ids used to prune,
  // because `pruneUnknownIds` asks the catalogue and the catalogue had never
  // heard of them; the payload's own content is what registers them first.
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

  // A payload carrying nothing external must not disturb what the browser
  // already holds — importing a colleague's catalogue-only link is not a reason
  // to lose the skills you added yourself.
  it("keeps the skills already added when a payload names none", () => {
    adoptSeedPayload(toSeedPayload(config()))

    expect(useCatalogStore.getState().external[HOUSE_ID]).toBeDefined()
  })
})

// The saved stack has no id to be recognised by, so "it is applied" is a
// comparison rather than a lookup: the selection on screen minting the payload
// the slot holds. Everything the grid draws from it rests on that answer
// surviving the trip through the slot and back.
describe("matchesSavedStack", () => {
  const saved = () => toSeedPayload(config())

  it("says yes to the selection it was taken from", () => {
    expect(matchesSavedStack(config(), saved())).toBe(true)
  })

  // The one that matters on screen: applying the snapshot has to leave the
  // selection matching it, or the cell would go out the moment it came on.
  it("says yes to what the snapshot restores", () => {
    expect(matchesSavedStack(fromSeedPayload(saved()), saved())).toBe(true)
  })

  // Whatever the payload carries is a way for the two to differ, so a field the
  // wire holds is enough on its own — this is the confirm's whole trigger.
  it("says no once the selection moves off it", () => {
    const edited = {
      ...config(),
      agents: { [AGENT]: { on: true, model: "haiku" as const } },
    }

    expect(matchesSavedStack(edited, saved())).toBe(false)
  })

  // Nothing local ever equals nothing saved: with an empty slot there is no
  // stack to be on, and the grid draws no cell to light up.
  it("says no when the slot is empty", () => {
    expect(matchesSavedStack(config(), null)).toBe(false)
  })
})
