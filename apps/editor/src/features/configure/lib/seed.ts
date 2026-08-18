import {
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

// Only the ones the selection names. Content is the expensive part of a
// payload — a skill's directory is tens of KB against the whole selection's
// ~2 KB — so an added skill nobody picked has no more business here than a
// deselected skill's remembered setup does.
const travellingExternal = (config: ConfigSelection) =>
  Object.keys(config.skills).flatMap((skillId) => {
    const external = activeExternalSkill(skillId)
    return external ? [[skillId, toSeedExternalSkill(external)] as const] : []
  })

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
//
// Both catalogue facts come off the seat rather than from the vendored module.
// `matrixVersion` is the loaded catalogue's, so a receiver explaining skipped
// ids is told which catalogue they were minted against; `marketplace` is the
// ref it was fetched from, which is what lets `--from` install the skills these
// ids actually name rather than the receiver's own same-named ones. Absent for
// the default public catalogue — which is every payload minted before an org
// pointed this anywhere — so those payloads look exactly as they did.
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
    // Absent rather than empty for a selection with nothing external in it, so
    // the payload a catalogue-only configuration mints looks exactly as it did
    // before content travelled at all.
    ...(external.length > 0 && { external: Object.fromEntries(external) }),
  })
}

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

/**
 * The ids a payload named that the seated catalogue could not place.
 *
 * Pruning them is right — a configuration must not name skills nothing can
 * install — but pruning them in silence is what turns catalogue drift into a
 * link that comes back quietly smaller than it was sent, with nothing on screen
 * to say so.
 *
 * Measured against what the import actually produced rather than against the
 * catalogue directly, so it names exactly what was lost: an external skill's
 * own content registers its id before this runs, which is the ordering
 * `adoptSeedPayload` exists for, seen from the other end.
 */
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

// One id like any other, and losing it in silence is how a link arrives
// claiming to have been built from scratch.
const lostStack = (before: string | null, after: string | null) =>
  before !== null && after === null ? [before] : []

const externalFromPayload = (payload: SeedPayload): ExternalSkill[] =>
  Object.entries(payload.external ?? {}).map(([id, skill]) => ({
    id,
    ...skill,
  }))

/**
 * A payload made this browser's, catalogue first.
 *
 * The order is the whole of it. `pruneUnknownIds` drops every id the seated
 * catalogue does not know, and an external skill's id is known to no catalogue
 * until its own content puts it there — so seating the payload's external
 * skills has to happen BEFORE the pruning, or a shared link comes back quietly
 * smaller than it was sent (EDITOR-15, EDITOR-16).
 *
 * Additive rather than wholesale: importing a colleague's catalogue-only link
 * is not a reason to lose the skills you added yourself, and the seat's own
 * idempotence means an id this browser already holds is left as it is.
 */
export const adoptSeedPayload = (payload: SeedPayload): PersistedConfig => {
  useCatalogStore.getState().addExternal(externalFromPayload(payload))
  return fromSeedPayload(payload)
}
