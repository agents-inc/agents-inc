import {
  CODEX_MODEL_NAMES,
  SEED_VERSION,
  seedPayloadSchema,
  type SeedAgent,
  type SeedExternalSkill,
  type SeedPayload,
  type SeedSkill,
} from "@workspace/matrix"

import {
  activeExternalSkill,
  activeMarketplace,
  activeVersion,
  useCatalogStore,
  type ExternalSkill,
} from "@/stores/catalog-store"
import {
  isAgentOn,
  pruneUnknownIds,
  type AgentEntry,
  type PersistedConfig,
  type SkillEntry,
} from "@/stores/persisted-schema"

import type { ConfigSelection } from "./derive"

// Presence on the wire means "installs", so disabled rows and rows on
// pinned-off agents stay home. A row whose scopes cannot meet travels: it is
// an error on screen, not a row to strip (EDITOR-08). So the mint parses with
// the lenient schema; `createSharedConfig` enforces the write contract
// (CLI-851).
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

const isPinnedOff = (entry: AgentEntry) => entry.on === false

// The wire carries any id, since Codex retires them. Only one this editor
// offers crosses either way, so `inherit` never leaves and a retired id never
// lands.
const offeredCodexModel = (codexModel: string | undefined) => {
  const offered = CODEX_MODEL_NAMES.find((name) => name === codexModel)
  return offered === undefined ? {} : { codexModel: offered }
}

// Only an explicit pin says `on`; repeating a derived one is where the payload
// could contradict itself.
const toSeedAgent = (entry: AgentEntry): SeedAgent => ({
  ...(entry.on === true && { on: true }),
  ...(entry.model !== undefined && { model: entry.model }),
  ...offeredCodexModel(entry.codexModel),
  ...(entry.effort !== undefined && { effort: entry.effort }),
  ...(entry.scope !== undefined && { scope: entry.scope }),
})

const saysSomething = (agent: SeedAgent) => Object.keys(agent).length > 0

// An external skill's whole directory, minus the id it is already keyed by.
const toSeedExternalSkill = ({
  displayName,
  description,
  categoryId,
  repo,
  path,
  files,
}: ExternalSkill): SeedExternalSkill => ({
  displayName,
  description,
  categoryId,
  repo,
  path,
  files,
})

// Only the ones the selection names: content is the expensive part.
const travellingExternal = (config: ConfigSelection) =>
  Object.keys(config.skills).flatMap((skillId) => {
    const external = activeExternalSkill(skillId)
    return external ? [[skillId, toSeedExternalSkill(external)] as const] : []
  })

// Sparse: an agent with nothing to say gets no entry.
const travellingAgents = (config: ConfigSelection) =>
  Object.entries(config.agents)
    .filter(([, entry]) => !isPinnedOff(entry))
    .map(([agentId, entry]) => [agentId, toSeedAgent(entry)] as const)
    .filter(([, agent]) => saysSomething(agent))

// The exact JSON the config store holds. The parse strips anything the
// contract does not know, so no store field leaks unnoticed; `remembered` never
// travels. `matrixVersion` and `marketplace` come off the seat, so `--from`
// installs the skills these ids name; `marketplace` is absent for the public
// catalogue.
export const toSeedPayload = (config: ConfigSelection): SeedPayload => {
  const marketplace = activeMarketplace()
  const external = travellingExternal(config)

  return seedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: activeVersion(),
    stackId: config.stackId,
    ...(marketplace !== null && { marketplace }),
    skills: Object.fromEntries(
      Object.entries(config.skills).map(([skillId, entry]) => [
        skillId,
        toSeedSkill(entry, (agentId) => isAgentOn(config, agentId)),
      ])
    ),
    agents: Object.fromEntries(travellingAgents(config)),
    ...(external.length > 0 && { external: Object.fromEntries(external) }),
  })
}

// Whether what is on screen is the saved snapshot, which has no id to match.
// Compared as serialized payloads, the identity `useInstallCommand` keys on; a
// reorder reads as a difference, which errs towards asking first.
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

// Absent stays absent: "no choice" is the missing key, never `undefined`.
const fromSeedAgent = (agent: SeedAgent): AgentEntry => ({
  ...(agent.on !== undefined && { on: agent.on }),
  ...(agent.model !== undefined && { model: agent.model }),
  ...offeredCodexModel(agent.codexModel),
  ...(agent.effort !== undefined && { effort: agent.effort }),
  ...(agent.scope !== undefined && { scope: agent.scope }),
})

// Ids this catalogue does not know are pruned, skip-don't-fail, as the CLI
// does. `remembered` starts empty: it never travels.
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

// The ids the import pruned, so a link that arrives smaller says so. Measured
// against what the import produced, so it names exactly what was lost.
export const unknownPayloadIds = (
  payload: SeedPayload,
  adopted: PersistedConfig
): string[] => [
  ...lost(payload.skills, adopted.skills),
  ...lost(payload.agents, adopted.agents),
  ...lostStack(payload.stackId, adopted.stackId),
]

// The keys the map on the left had and the one on the right no longer holds.
const lost = (before: object, after: object) =>
  Object.keys(before).filter((id) => !(id in after))

const lostStack = (before: string | null, after: string | null) =>
  before !== null && after === null ? [before] : []

const externalFromPayload = (payload: SeedPayload): ExternalSkill[] =>
  Object.entries(payload.external ?? {}).map(([id, skill]) => ({
    id,
    ...skill,
  }))

// Seats the payload's external skills before pruning, or their ids would be
// pruned (EDITOR-15, EDITOR-16). Additive: skills added here already stay.
export const adoptSeedPayload = (payload: SeedPayload): PersistedConfig => {
  useCatalogStore.getState().addExternal(externalFromPayload(payload))
  return fromSeedPayload(payload)
}
