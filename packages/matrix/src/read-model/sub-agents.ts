import { AGENT_DEFINITIONS } from "../generated/agents"
import {
  DOMAINS,
  type AgentName,
  type Domain,
} from "../vendor/generated/source-types"
import { AgentDefinitionsSchema, type ParsedAgentDefinition } from "../schema"
import { DOMAIN_LABELS, compareDomains } from "./domains"

export type SubAgent = {
  id: AgentName
  // Label inside its domain group — "Developer" for `web-developer`.
  label: string
  title: string
  description: string
  model?: string
  domainId: Domain
  flavor: string
}

export type SubAgentGroup = {
  domainId: Domain
  label: string
  agents: SubAgent[]
}

const DOMAIN_IDS = new Set<string>(DOMAINS)

// Agent ids are `<domain>-<role>` for the 18 agents that belong to a domain. The other five
// (`agent-summoner`, `codex-keeper`, `convention-keeper`, `pattern-scout`, `skill-summoner`)
// have no domain prefix and land in `meta`, alongside the meta-domain skills.
//
// The CLI's `MergedSkillsMatrix.agentDefinedDomains` would be the authoritative source, but it
// is never populated and the CLI has it queued for deletion, so the prefix is what we have.
const domainOf = (agentId: string): Domain => {
  const prefix = agentId.split("-")[0]
  return prefix && DOMAIN_IDS.has(prefix) ? (prefix as Domain) : "meta"
}

// Role fragments that are initialisms, so `web-pm` reads "PM" and not "Pm".
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

// `web-pattern-critique` → "Pattern Critique"; `codex-keeper` → "Codex Keeper".
const labelOf = (agentId: string, domainId: Domain) =>
  agentId.startsWith(`${domainId}-`)
    ? titleCase(agentId.slice(domainId.length + 1))
    : titleCase(agentId)

const toSubAgent = (definition: ParsedAgentDefinition): SubAgent => {
  const domainId = domainOf(definition.id)
  return {
    id: definition.id as AgentName,
    label: labelOf(definition.id, domainId),
    title: definition.title,
    description: definition.description,
    model: definition.model,
    domainId,
    flavor: definition.flavor,
  }
}

const buildSubAgentGroups = (): SubAgentGroup[] => {
  const agents = Object.values(
    AgentDefinitionsSchema.parse(AGENT_DEFINITIONS)
  ).map(toSubAgent)

  const byDomain = new Map<Domain, SubAgent[]>()
  for (const agent of agents) {
    const bucket = byDomain.get(agent.domainId)
    if (bucket) bucket.push(agent)
    else byDomain.set(agent.domainId, [agent])
  }

  return [...byDomain.entries()]
    .sort(([a], [b]) => compareDomains(a, b))
    .map(([domainId, domainAgents]) => ({
      domainId,
      label: DOMAIN_LABELS[domainId],
      agents: domainAgents.sort((a, b) => a.label.localeCompare(b.label)),
    }))
}

export const SUB_AGENT_GROUPS = buildSubAgentGroups()

export const SUB_AGENTS_BY_ID: Record<string, SubAgent> = Object.fromEntries(
  SUB_AGENT_GROUPS.flatMap((group) => group.agents).map((agent) => [
    agent.id,
    agent,
  ])
)
