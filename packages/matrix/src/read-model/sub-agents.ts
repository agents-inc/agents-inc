import { AGENT_DEFINITIONS } from "../generated/agents"
import {
  AGENT_NAMES,
  type AgentName,
  type Domain,
} from "../vendor/generated/source-types"
import type { ModelName } from "../vendor/matrix"
import {
  agentDefinitionsSchema,
  type ParsedAgentDefinition,
} from "../built-in-agents"
import { groupBy, indexById } from "./collections"
import { DOMAIN_LABELS, agentDomainOf, compareDomains } from "./domains"
import { flavorOf, type RoleFlavor } from "./preload-defaults"

export type SubAgent = {
  id: AgentName
  // Label inside its domain group — "Developer" for `web-developer`.
  label: string
  title: string
  description: string
  model?: ModelName
  domainId: Domain
  flavor: RoleFlavor
}

export type SubAgentGroup = {
  domainId: Domain
  label: string
  agents: SubAgent[]
}

// Role fragments that are initialisms, so `pm` reads "PM" and not "Pm".
const ACRONYMS = new Set(["pm", "ai", "api", "cli", "ui", "ux", "qa"])

const titleCase = (words: string) =>
  words
    .split("-")
    .map((word) =>
      ACRONYMS.has(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ")

// `web-researcher` → "Researcher"; `codex-keeper` → "Codex Keeper".
const labelOf = (agentId: string, domainId: Domain) =>
  agentId.startsWith(`${domainId}-`)
    ? titleCase(agentId.slice(domainId.length + 1))
    : titleCase(agentId)

const toSubAgent = (definition: ParsedAgentDefinition): SubAgent => {
  const domainId = agentDomainOf(definition.id)
  return {
    id: definition.id,
    label: labelOf(definition.id, domainId),
    title: definition.title,
    description: definition.description,
    ...(definition.model !== undefined && { model: definition.model }),
    domainId,
    flavor: flavorOf(definition.id),
  }
}

const toSubAgentGroup = (
  domainId: Domain,
  agents: SubAgent[]
): SubAgentGroup => ({
  domainId,
  label: DOMAIN_LABELS[domainId],
  agents: agents.sort((a, b) => a.label.localeCompare(b.label)),
})

const buildSubAgentGroups = (): SubAgentGroup[] => {
  const agents = Object.values(
    agentDefinitionsSchema.parse(AGENT_DEFINITIONS)
  ).map(toSubAgent)

  return [...groupBy(agents, (agent) => agent.domainId)]
    .sort(([a], [b]) => compareDomains(a, b))
    .map(([domainId, domainAgents]) => toSubAgentGroup(domainId, domainAgents))
}

export const SUB_AGENT_GROUPS = buildSubAgentGroups()

export const SUB_AGENTS_BY_ID: Partial<Record<AgentName, SubAgent>> = indexById(
  SUB_AGENT_GROUPS.flatMap((group) => group.agents)
)

const ROSTER_IDS = new Set<string>(AGENT_NAMES)

const isAgentName = (agentId: string): agentId is AgentName =>
  ROSTER_IDS.has(agentId)

/** A retired or unknown id answers `undefined`. */
export const subAgentById = (agentId: string): SubAgent | undefined =>
  isAgentName(agentId) ? SUB_AGENTS_BY_ID[agentId] : undefined
