import {
  MATRIX_VERSION,
  SEED_VERSION,
  seedPayloadSchema,
  type SeedAgent,
  type SeedPayload,
  type SeedSkill,
} from "@workspace/matrix"

import {
  isAgentOn,
  pruneUnknownIds,
  type AgentEntry,
  type PersistedConfig,
  type SkillEntry,
} from "@/stores/persisted-schema"

import type { ConfigSelection } from "./derive"

// The wire keeps assignments as agent → load with presence meaning "live", so
// nothing the panel shows recessed may travel: rows switched off are dropped,
// and so are rows on pinned-off agents — the CLI must never install what the
// sharer's own counts exclude.
const travelling = (entry: SkillEntry, isOn: (agentId: string) => boolean) =>
  Object.entries(entry.assignments).filter(
    ([agentId, assignment]) => assignment.enabled && isOn(agentId)
  )

const toSeedSkill = (
  entry: SkillEntry,
  isOn: (agentId: string) => boolean
): SeedSkill => ({
  install: entry.install,
  scope: entry.scope,
  assignments: Object.fromEntries(
    travelling(entry, isOn).map(([agentId, assignment]) => [
      agentId,
      assignment.load,
    ])
  ),
})

// Pins travel as of v2, which is what makes a bare base agent shareable at
// all. Only in one direction, though: a pinned-off agent is excluded from
// every count on the sharer's screen, so it — and its rows above — stay home.
const isPinnedOff = (entry: AgentEntry) => entry.on === false

// An agent switched on by its assignments is already implied by them, so
// repeating `on` would be the one place the payload could contradict itself:
// only an explicit pin says `on`, and a derived-on agent travels its overrides
// alone.
const toSeedAgent = (entry: AgentEntry): SeedAgent => ({
  ...(entry.on === true && { on: true }),
  ...(entry.model !== undefined && { model: entry.model }),
  ...(entry.effort !== undefined && { effort: entry.effort }),
  ...(entry.scope !== undefined && { scope: entry.scope }),
})

const saysSomething = (agent: SeedAgent) => Object.keys(agent).length > 0

// Sparse, like the skill map: an agent resting on its catalogue model with
// medium effort and no pin has nothing to say, so it gets no entry.
const travellingAgents = (config: ConfigSelection) =>
  Object.entries(config.agents)
    .filter(([, entry]) => !isPinnedOff(entry))
    .map(([agentId, entry]) => [agentId, toSeedAgent(entry)] as const)
    .filter(([, agent]) => saysSomething(agent))

// Builds the exact JSON the config store (Cloudflare KV) will hold: the
// selection under the versioned envelope, nothing else. Read-only — the store
// is untouched, and `remembered` never appears because `ConfigSelection` is
// the same narrowing that keeps it out of every derivation. The parse makes
// "exact" literal: anything the contract doesn't know is stripped, so a field
// added to the store later cannot leak into payloads unnoticed.
export const toSeedPayload = (config: ConfigSelection): SeedPayload =>
  seedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: MATRIX_VERSION,
    stackId: config.stackId,
    skills: Object.fromEntries(
      Object.entries(config.skills).map(([skillId, entry]) => [
        skillId,
        toSeedSkill(entry, (agentId) => isAgentOn(config, agentId)),
      ])
    ),
    agents: Object.fromEntries(travellingAgents(config)),
  })

// Whether what is on screen *is* the snapshot in the slot. A snapshot taken
// from scratch carries no `stackId`, so nothing in the stored selection can
// name it — being it is the only thing that can say the saved stack is applied,
// which makes this a question about the format rather than about any component.
//
// Compared as serialized payloads: the same identity `useInstallCommand` keys
// on, where two selections that mint the same payload are the same
// configuration to everything downstream. A selection reordered without being
// changed reads as a difference, which errs towards asking first — the only
// direction that cannot lose work.
export const matchesSavedStack = (
  config: ConfigSelection,
  saved: SeedPayload | null
): boolean =>
  saved !== null &&
  JSON.stringify(toSeedPayload(config)) === JSON.stringify(saved)

const fromSeedSkill = (skill: SeedSkill): SkillEntry => ({
  install: skill.install,
  scope: skill.scope,
  assignments: Object.fromEntries(
    Object.entries(skill.assignments).map(([agentId, load]) => [
      agentId,
      { load, enabled: true },
    ])
  ),
})

// Absent fields stay absent rather than arriving as explicit `undefined`: the
// store's map holds choices, and "no choice" is the missing key.
const fromSeedAgent = (agent: SeedAgent): AgentEntry => ({
  ...(agent.on !== undefined && { on: agent.on }),
  ...(agent.model !== undefined && { model: agent.model }),
  ...(agent.effort !== undefined && { effort: agent.effort }),
  ...(agent.scope !== undefined && { scope: agent.scope }),
})

// The inbound half. A payload may have been minted against any matrix version,
// so ids this catalog does not know are pruned — the same skip-don't-fail
// policy the CLI will apply, and the agents map is now the one place a retired
// agent can arrive without an assignment. `remembered` starts empty: it never
// travels.
export const fromSeedPayload = (payload: SeedPayload): PersistedConfig =>
  pruneUnknownIds({
    stackId: payload.stackId,
    skills: Object.fromEntries(
      Object.entries(payload.skills).map(([skillId, skill]) => [
        skillId,
        fromSeedSkill(skill),
      ])
    ),
    remembered: {},
    agents: Object.fromEntries(
      Object.entries(payload.agents).map(([agentId, agent]) => [
        agentId,
        fromSeedAgent(agent),
      ])
    ),
  })
