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

// Presence on the wire means "installs". A row whose scopes cannot meet still
// travels: it is an on-screen error, not a row to strip.
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

// Only ids this editor offers cross either way: `inherit` never leaves and a
// retired id never lands.
const offeredCodexModel = (codexModel: string | undefined) => {
  const offered = CODEX_MODEL_NAMES.find((name) => name === codexModel)
  return offered === undefined ? {} : { codexModel: offered }
}

// Only an explicit pin says `on`, so the payload cannot contradict itself.
const toSeedAgent = (entry: AgentEntry): SeedAgent => ({
  ...(entry.on === true && { on: true }),
  ...(entry.model !== undefined && { model: entry.model }),
  ...offeredCodexModel(entry.codexModel),
  ...(entry.effort !== undefined && { effort: entry.effort }),
  ...(entry.scope !== undefined && { scope: entry.scope }),
})

const saysSomething = (agent: SeedAgent) => Object.keys(agent).length > 0

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

// Only selected ones: content is the expensive part.
const travellingExternal = (config: ConfigSelection) =>
  Object.keys(config.skills).flatMap((skillId) => {
    const external = activeExternalSkill(skillId)
    return external ? [[skillId, toSeedExternalSkill(external)] as const] : []
  })

const travellingAgents = (config: ConfigSelection) =>
  Object.entries(config.agents)
    .filter(([, entry]) => !isPinnedOff(entry))
    .map(([agentId, entry]) => [agentId, toSeedAgent(entry)] as const)
    .filter(([, agent]) => saysSomething(agent))

// The parse strips unknown fields so no store field leaks; `remembered` never
// travels.
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

// The saved snapshot has no id, so compare serialized payloads; a reorder
// reads as a difference, erring towards asking first.
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

// "No choice" is the missing key, never `undefined`.
const fromSeedAgent = (agent: SeedAgent): AgentEntry => ({
  ...(agent.on !== undefined && { on: agent.on }),
  ...(agent.model !== undefined && { model: agent.model }),
  ...offeredCodexModel(agent.codexModel),
  ...(agent.effort !== undefined && { effort: agent.effort }),
  ...(agent.scope !== undefined && { scope: agent.scope }),
})

// Unknown ids are pruned, skip-don't-fail, as the CLI does.
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

// The ids the import pruned, so a link that arrives smaller says so.
export const unknownPayloadIds = (
  payload: SeedPayload,
  adopted: PersistedConfig
): string[] => [
  ...lost(payload.skills, adopted.skills),
  ...lost(payload.agents, adopted.agents),
  ...lostStack(payload.stackId, adopted.stackId),
]

const lost = (before: object, after: object) =>
  Object.keys(before).filter((id) => !(id in after))

const lostStack = (before: string | null, after: string | null) =>
  before !== null && after === null ? [before] : []

const externalFromPayload = (payload: SeedPayload): ExternalSkill[] =>
  Object.entries(payload.external ?? {}).map(([id, skill]) => ({
    id,
    ...skill,
  }))

// External skills are seated first, or pruning would drop their ids.
export const adoptSeedPayload = (payload: SeedPayload): PersistedConfig => {
  useCatalogStore.getState().addExternal(externalFromPayload(payload))
  return fromSeedPayload(payload)
}
