import type { Provider } from "@workspace/compile"
import type { SeedPayload } from "@workspace/matrix"

import { entriesWhere } from "@/lib/entries-where"
import { mapValues } from "@/lib/map-values"
import { withoutKey } from "@/lib/without-key"
import { exclusiveCategoryOf, isInCategory } from "@/stores/catalog-store"
import {
  isAgentOn,
  resolveAgentOptions,
  type AgentEntry,
  type AgentOptions,
  type PersistedConfig,
  type SkillEntry,
  type SkillOptions,
} from "@/stores/persisted-schema"

import { displayNameOf } from "./derive"

// A link a bare `edit` minted inside a project also holds the global install's
// entries, which a run in that project can add to but never switch off or
// change. Switched to project, an entry is the project's own copy and changes
// freely; switched back, it is as it arrived.

/** The global skills and sub-agents a project's link arrived with, as they arrived. */
export type HeldGlobal = {
  skills: Readonly<Record<string, SkillEntry>>
  agents: Readonly<Record<string, AgentEntry>>
}

type Selection = Pick<PersistedConfig, "skills" | "agents">

const SWITCH_OFF_REFUSED =
  "Installed globally, so this project can't switch it off."

const CHANGE_REFUSED =
  "Installed globally, so this project can't change it. Switch it to project to change a copy of its own."

const swapRefused = (heldSkillId: string) =>
  `${displayNameOf(heldSkillId)} is installed globally, so this project can't swap it out.`

const namedAgentIds = ({ skills, agents }: Selection) => [
  ...new Set([
    ...Object.keys(agents),
    ...Object.values(skills).flatMap((entry) => Object.keys(entry.assignments)),
  ]),
]

const isGlobalAgent = (selection: Selection, agentId: string) =>
  isAgentOn(selection, agentId) &&
  resolveAgentOptions(selection.agents, agentId).scope === "global"

const globalSkillsOf = ({ skills }: Selection) =>
  Object.fromEntries(
    Object.entries(skills).filter(([, entry]) => entry.scope === "global")
  )

// An agent on only through its rows has no entry, so it arrived as `{}`.
const globalAgentsOf = (selection: Selection) =>
  Object.fromEntries(
    namedAgentIds(selection)
      .filter((agentId) => isGlobalAgent(selection, agentId))
      .map((agentId) => [agentId, selection.agents[agentId] ?? {}])
  )

export const heldGlobalOf = (
  payload: SeedPayload,
  arrived: Selection
): HeldGlobal | null => {
  if (payload.fromProject !== true) return null

  return { skills: globalSkillsOf(arrived), agents: globalAgentsOf(arrived) }
}

/** The installation a bare `edit` minted a link from, which `edit --from` applies it back to. */
export type MintedFrom = "project" | "global"

// Project first, as `heldGlobalOf` reads a link carrying both marks.
export const mintedFromOf = (payload: SeedPayload): MintedFrom | null => {
  if (payload.fromProject === true) return "project"
  if (payload.fromGlobal === true) return "global"
  return null
}

const isInheritedSkill = (held: HeldGlobal | null, skillId: string) =>
  held !== null && Object.hasOwn(held.skills, skillId)

const isInheritedAgent = (held: HeldGlobal | null, agentId: string) =>
  held !== null && Object.hasOwn(held.agents, agentId)

/** Still the global entry: drawn disabled, everything but its scope refused. */
export const isHeldSkill = (
  held: HeldGlobal | null,
  config: Selection,
  skillId: string
) =>
  isInheritedSkill(held, skillId) && config.skills[skillId]?.scope === "global"

export const isHeldAgent = (
  held: HeldGlobal | null,
  config: Selection,
  agentId: string
) =>
  isInheritedAgent(held, agentId) &&
  resolveAgentOptions(config.agents, agentId).scope === "global"

// Picking a sibling in a one-of category would evict it.
const heldRivalOf = (
  held: HeldGlobal | null,
  config: Selection,
  skillId: string
) => {
  const categoryId = exclusiveCategoryOf(skillId)
  if (categoryId === undefined) return undefined

  return Object.keys(config.skills).find(
    (selected) =>
      selected !== skillId &&
      isInheritedSkill(held, selected) &&
      isInCategory(selected, categoryId)
  )
}

/** At either scope: switched off, the global entry would vanish from view while staying installed. */
export const skillToggleRefusal = (
  held: HeldGlobal | null,
  config: Selection,
  skillId: string
): string | undefined => {
  if (Object.hasOwn(config.skills, skillId))
    return isInheritedSkill(held, skillId) ? SWITCH_OFF_REFUSED : undefined

  const rival = heldRivalOf(held, config, skillId)
  return rival === undefined ? undefined : swapRefused(rival)
}

const changesMoreThanScope = (patch: object) =>
  Object.keys(patch).some((field) => field !== "scope")

// Moved to project, the rest of the patch is the copy's.
const changesTheGlobalSkill = (patch: Partial<SkillOptions>) =>
  patch.scope !== "project" && changesMoreThanScope(patch)

/** Every option but its scope, which is the way to a copy of its own. */
export const skillChangeRefusal = (
  held: HeldGlobal | null,
  config: Selection,
  skillId: string
): string | undefined =>
  isHeldSkill(held, config, skillId) ? CHANGE_REFUSED : undefined

export const skillOptionRefusal = (
  held: HeldGlobal | null,
  config: Selection,
  skillId: string,
  patch: Partial<SkillOptions>
): string | undefined =>
  changesTheGlobalSkill(patch)
    ? skillChangeRefusal(held, config, skillId)
    : undefined

/** On Codex a project copy is ejected, since no plugin installs at project. */
export const pressOnHeldSkill = (
  provider: Provider,
  patch: Partial<SkillOptions>
): Partial<SkillOptions> =>
  provider === "codex" && patch.scope === "project"
    ? { ...patch, install: "eject" }
    : patch

const hasRow = (config: Selection, skillId: string, agentId: string) =>
  config.skills[skillId]?.assignments[agentId] !== undefined

/** A global sub-agent's rows of a global skill are the global install's, and it takes no new one. */
export const assignmentRefusal = (
  held: HeldGlobal | null,
  config: Selection,
  skillId: string,
  agentId: string
): string | undefined => {
  if (!isHeldAgent(held, config, agentId)) return undefined

  return hasRow(config, skillId, agentId)
    ? skillChangeRefusal(held, config, skillId)
    : CHANGE_REFUSED
}

/** A skill picked or replaced in reaches no sub-agent the link holds. */
export const offHeldAgents = (
  held: HeldGlobal | null,
  config: Selection,
  entry: SkillEntry
): SkillEntry => ({
  ...entry,
  assignments: entriesWhere(
    entry.assignments,
    (agentId) => !isHeldAgent(held, config, agentId)
  ),
})

const inheritedSkillsOf = (held: HeldGlobal, { skills }: Selection) =>
  entriesWhere(skills, (skillId) => isInheritedSkill(held, skillId))

const inheritedAgentsOf = (held: HeldGlobal, { agents }: Selection) =>
  entriesWhere(agents, (agentId) => isInheritedAgent(held, agentId))

const uninheritedAgentsOf = (held: HeldGlobal, { agents }: Selection) =>
  entriesWhere(agents, (agentId) => !isInheritedAgent(held, agentId))

// None the link holds, none that would swap one out, and none reaching a held
// sub-agent.
const joiningSkillsOf = (
  held: HeldGlobal,
  current: Selection,
  { skills }: Selection
) =>
  mapValues(
    entriesWhere(
      skills,
      (skillId) =>
        !isInheritedSkill(held, skillId) &&
        heldRivalOf(held, current, skillId) === undefined
    ),
    (entry) => offHeldAgents(held, current, entry)
  )

/**
 * A whole new selection (a stack, a save, Start from scratch) leaves what the
 * link holds as it is, at either scope, as the presses one at a time do.
 */
export const keepingHeld = <T extends Selection>(
  held: HeldGlobal | null,
  current: Selection,
  replacement: T
): T => {
  if (held === null) return replacement

  return {
    ...replacement,
    skills: {
      ...joiningSkillsOf(held, current, replacement),
      ...inheritedSkillsOf(held, current),
    },
    agents: {
      ...uninheritedAgentsOf(held, replacement),
      ...inheritedAgentsOf(held, current),
    },
  }
}

export const holdsAnything = (held: HeldGlobal | null) =>
  held !== null &&
  Object.keys(held.skills).length + Object.keys(held.agents).length > 0

/** The selected skills a whole new selection would leave out. */
export const replaceableSkillCount = (
  held: HeldGlobal | null,
  config: Selection
) =>
  Object.keys(config.skills).filter(
    (skillId) => !isInheritedSkill(held, skillId)
  ).length

export const agentPinRefusal = (
  held: HeldGlobal | null,
  config: Selection,
  agentId: string
): string | undefined =>
  isInheritedAgent(held, agentId) && isAgentOn(config, agentId)
    ? SWITCH_OFF_REFUSED
    : undefined

export const agentChangeRefusal = (
  held: HeldGlobal | null,
  config: Selection,
  agentId: string
): string | undefined =>
  isHeldAgent(held, config, agentId) ? CHANGE_REFUSED : undefined

export const agentOptionRefusal = (
  held: HeldGlobal | null,
  config: Selection,
  agentId: string,
  patch: Partial<AgentOptions>
): string | undefined =>
  changesMoreThanScope(patch)
    ? agentChangeRefusal(held, config, agentId)
    : undefined

const rowsOnHeldAgents = (
  held: HeldGlobal | null,
  config: Selection,
  entry: SkillEntry
) =>
  entriesWhere(entry.assignments, (agentId) =>
    isHeldAgent(held, config, agentId)
  )

/**
 * A held skill back at global drops the project's copy, so it is as it arrived
 * on the sub-agents the link holds. Its row on any other is the project's own.
 */
export const skillAsHeld = (
  held: HeldGlobal | null,
  config: Selection,
  skillId: string,
  entry: SkillEntry
): SkillEntry => {
  const arrived = held?.skills[skillId]
  if (arrived === undefined || entry.scope !== "global") return entry

  return {
    ...arrived,
    assignments: {
      ...rowsOnHeldAgents(held, config, arrived),
      ...offHeldAgents(held, config, entry).assignments,
    },
  }
}

const withArrivedRow = (
  entry: SkillEntry,
  arrived: SkillEntry,
  agentId: string
): SkillEntry => {
  const others = withoutKey(entry.assignments, agentId)
  const row = arrived.assignments[agentId]

  return {
    ...entry,
    assignments: row === undefined ? others : { ...others, [agentId]: row },
  }
}

// Only a held skill's: a project skill's row on it is the project's own.
const withArrivedRowsFor = (
  held: HeldGlobal,
  skills: Selection["skills"],
  agentId: string
) =>
  Object.fromEntries(
    Object.entries(skills).map(([skillId, entry]) => {
      const arrived = held.skills[skillId]
      const isHeld = arrived !== undefined && entry.scope === "global"
      return [skillId, isHeld ? withArrivedRow(entry, arrived, agentId) : entry]
    })
  )

/** A held sub-agent back at global is as it arrived, with the held skills' rows on it. */
export const agentAsHeld = (
  held: HeldGlobal | null,
  config: Selection,
  agentId: string
): Selection => {
  const arrived = held?.agents[agentId]
  if (held === null || arrived === undefined) return config
  if (!isHeldAgent(held, config, agentId)) return config

  return {
    agents: { ...config.agents, [agentId]: arrived },
    skills: withArrivedRowsFor(held, config.skills, agentId),
  }
}
