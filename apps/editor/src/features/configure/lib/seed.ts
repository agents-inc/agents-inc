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
  activeStacks,
  activeVersion,
  useCatalogStore,
  type ExternalSkill,
} from "@/stores/catalog-store"
import { activeDescription, stackSelection } from "@/stores/config-store"
import {
  isAgentOn,
  pruneUnknownIds,
  resolveAgentOptions,
  type AgentEntry,
  type PersistedConfig,
  type SkillEntry,
} from "@/stores/persisted-schema"

import type { ConfigSelection } from "./derive"

const mapValues = <T, U>(record: Record<string, T>, to: (value: T) => U) =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, to(value)])
  )

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
  const description = activeDescription()
  const external = travellingExternal(config)

  return seedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: activeVersion(),
    stackId: config.stackId,
    ...(description !== undefined && { description }),
    ...(marketplace !== null && { marketplace }),
    skills: mapValues(config.skills, (entry) =>
      toSeedSkill(entry, (agentId) => isAgentOn(config, agentId))
    ),
    agents: Object.fromEntries(travellingAgents(config)),
    ...(external.length > 0 && { external: Object.fromEntries(external) }),
  })
}

const fromSeedSkill = (skill: SeedSkill): SkillEntry => ({
  install: skill.install,
  scope: skill.scope,
  assignments: mapValues(skill.assignments, (load) => ({
    load,
    enabled: true,
  })),
})

// "No choice" is the missing key, never `undefined`.
const fromSeedAgent = (agent: SeedAgent): AgentEntry => ({
  ...(agent.on !== undefined && { on: agent.on }),
  ...(agent.model !== undefined && { model: agent.model }),
  ...offeredCodexModel(agent.codexModel),
  ...(agent.effort !== undefined && { effort: agent.effort }),
  ...(agent.scope !== undefined && { scope: agent.scope }),
})

// Unpruned: a save minted on another catalogue keeps every id it names.
const asSelection = (payload: SeedPayload) => ({
  skills: mapValues(payload.skills, fromSeedSkill),
  agents: mapValues(payload.agents, fromSeedAgent),
})

// Unknown ids are pruned, skip-don't-fail, as the CLI does.
export const fromSeedPayload = (payload: SeedPayload): PersistedConfig =>
  pruneUnknownIds({
    stackId: payload.stackId,
    ...asSelection(payload),
    remembered: {},
    ...(payload.description !== undefined && {
      description: payload.description,
    }),
  })

// The saved snapshot has no id, so it is recognised by what it installs.
export const matchesSavedStack = (
  config: ConfigSelection,
  saved: SeedPayload | null
): boolean => saved !== null && meaningOfSelection(config) === meaningOf(saved)

/**
 * A link minted without a stack id, as the CLI mints, opens on the built-in
 * stack it is, as that stack applied; anything else opens as it arrived.
 */
export const recogniseStack = (
  payload: SeedPayload,
  adopted: PersistedConfig
): PersistedConfig => {
  if (payload.stackId !== null) return adopted

  const arrived = meaningOfSelection(adopted)
  const recognised = appliedStacks().find(
    (applied) => meaningOfSelection(applied) === arrived
  )

  return recognised ?? adopted
}

// What a receiver installs, and nothing of how it was spelled: no stack id,
// matrix version or key order.
const meaningOf = (payload: SeedPayload): string => {
  const selection = asSelection(payload)
  const isOn = (agentId: string) => isAgentOn(selection, agentId)

  return JSON.stringify(
    inKeyOrder({
      marketplace: payload.marketplace,
      skills: mapValues(payload.skills, (skill) => installedRows(skill, isOn)),
      agents: resolvedRoster(
        agentsNamedIn(payload).filter(isOn),
        selection.agents
      ),
      external: payload.external ?? {},
    })
  )
}

const meaningOfSelection = (config: ConfigSelection) =>
  meaningOf(toSeedPayload(config))

const appliedStacks = () =>
  activeStacks()
    .map((stack) => stackSelection(stack.id))
    .filter((applied) => applied !== undefined)

// A row to a sub-agent that is off installs nothing.
const installedRows = (
  { install, scope, assignments }: SeedSkill,
  isOn: (agentId: string) => boolean
) => ({
  install,
  scope,
  assignments: Object.fromEntries(
    Object.entries(assignments).filter(([agentId]) => isOn(agentId))
  ),
})

const agentsNamedIn = (payload: SeedPayload) => [
  ...new Set([
    ...Object.keys(payload.agents),
    ...Object.values(payload.skills).flatMap((skill) =>
      Object.keys(skill.assignments)
    ),
  ]),
]

// Resolved, so a choice spelled out at its resting value reads as none.
const resolvedRoster = (
  agentIds: readonly string[],
  agents: PersistedConfig["agents"]
) =>
  Object.fromEntries(
    agentIds.map((agentId) => [agentId, resolveAgentOptions(agents, agentId)])
  )

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const inKeyOrder = (value: unknown): unknown =>
  isRecord(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, inKeyOrder(value[key])])
      )
    : value

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
