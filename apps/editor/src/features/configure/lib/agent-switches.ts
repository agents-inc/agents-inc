import type { Provider } from "@workspace/compile"
import { DOMAIN_LABELS, type SubAgent } from "@workspace/matrix"

import {
  displayNameOf,
  selectInstalledAgents,
  type ConfigSelection,
} from "./derive"

// A notice names this many, then counts the rest.
const NAMED_IN_FULL = 3

// As the roster's where-used list names it: `web tester`.
const spokenName = (agent: SubAgent) =>
  `${DOMAIN_LABELS[agent.domainId].toLowerCase()} ${agent.label.toLowerCase()}`

const inAnEnglishList = (items: readonly string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`

const namedThenCounted = (names: readonly string[]) =>
  names.length > NAMED_IN_FULL
    ? `${names.slice(0, NAMED_IN_FULL).join(", ")} and ${names.length - NAMED_IN_FULL} more`
    : inAnEnglishList(names)

const liveSkillIds = (config: ConfigSelection, agentId: string) =>
  Object.entries(config.skills)
    .filter(([, entry]) => entry.assignments[agentId]?.enabled)
    .map(([skillId]) => skillId)

// What `to` gives the sub-agent that `from` did not.
const skillsGained = (
  from: ConfigSelection,
  to: ConfigSelection,
  agentId: string
) => {
  const held = new Set(liveSkillIds(from, agentId))
  return liveSkillIds(to, agentId).filter((skillId) => !held.has(skillId))
}

// "On" as the roster draws it, so a sub-agent the provider leaves out is never
// named.
const newlyInstalled = (
  from: ConfigSelection,
  to: ConfigSelection,
  provider: Provider
) => {
  const before = new Set(
    selectInstalledAgents(from, provider).map(({ id }) => id)
  )
  return selectInstalledAgents(to, provider).filter(({ id }) => !before.has(id))
}

type AgentSwitch = { agents: SubAgent[]; skillIds: string[] }

// The sub-agents `to` switched on, and the skills that did it. Asked from
// `to` back to `from`, it finds what was switched off.
const switchedOn = (
  from: ConfigSelection,
  to: ConfigSelection,
  provider: Provider
): AgentSwitch => {
  const agents = newlyInstalled(from, to, provider)
  const skillIds = agents.flatMap(({ id }) => skillsGained(from, to, id))

  return { agents, skillIds: [...new Set(skillIds)] }
}

const noticeOf = (
  { agents, skillIds }: AgentSwitch,
  switched: "on" | "off",
  verb: "added" | "removed"
) => {
  if (agents.length === 0) return undefined

  return (
    `${namedThenCounted(agents.map(spokenName))} switched ${switched}: ` +
    `${namedThenCounted(skillIds.map(displayNameOf))} ${verb}`
  )
}

type SwitchNotice = (
  before: ConfigSelection,
  after: ConfigSelection,
  provider: Provider
) => string | undefined

const onNotice: SwitchNotice = (before, after, provider) =>
  noticeOf(switchedOn(before, after, provider), "on", "added")

const offNotice: SwitchNotice = (before, after, provider) =>
  noticeOf(switchedOn(after, before, provider), "off", "removed")

const noticesOf =
  (...notices: SwitchNotice[]) =>
  (before: ConfigSelection, after: ConfigSelection, provider: Provider) =>
    notices
      .map((notice) => notice(before, after, provider))
      .filter((notice) => notice !== undefined)

/** What a change to the selection says about the sub-agents it switched on and off, on first. */
export const agentSwitchNotices = noticesOf(onNotice, offNotice)

/** What it says about those it switched off alone. */
export const agentSwitchOffNotices = noticesOf(offNotice)
