import {
  SUB_AGENT_GROUPS,
  type AgentName,
  type Domain,
  type SubAgent,
  type SubAgentGroup,
} from "@workspace/matrix"

// Where the options panel places each sub-agent: a domain × role grid cell, or
// a row behind the Meta fold.

// `id` is the agent-id suffix after `<domain>-`, not a `SubAgent.flavor`.
export const ROLE_COLUMNS = [
  { id: "developer", short: "dev" },
  { id: "researcher", short: "res" },
  { id: "tester", short: "test" },
] as const

export type RoleColumn = (typeof ROLE_COLUMNS)[number]

export type MatrixGroup = {
  domainId: Domain
  label: string
  byRole: Map<string, SubAgent>
}

const CANONICAL_ROLES = new Set<string>(ROLE_COLUMNS.map((role) => role.id))

// Agent ids are `<domain>-<role>`; anything else has no role to read.
const roleOf = (agentId: string, domainId: Domain) =>
  agentId.startsWith(`${domainId}-`) ? agentId.slice(domainId.length + 1) : null

const isCanonicalRole = (role: string | null): role is string =>
  role !== null && CANONICAL_ROLES.has(role)

const canonicalAgentsByRole = (group: SubAgentGroup) => {
  const byRole = new Map<string, SubAgent>()

  for (const agent of group.agents) {
    const role = roleOf(agent.id, group.domainId)
    if (isCanonicalRole(role)) byRole.set(role, agent)
  }

  return byRole
}

const hasAnyRole = (group: MatrixGroup) => group.byRole.size > 0

const implementationGroups = SUB_AGENT_GROUPS.filter(
  (group) => group.domainId !== "meta"
)

// Drops only rows that would be all inert gaps.
export const matrixGroups: MatrixGroup[] = implementationGroups
  .map((group) => ({
    domainId: group.domainId,
    label: group.label,
    byRole: canonicalAgentsByRole(group),
  }))
  .filter(hasAnyRole)

export const metaAgents = SUB_AGENT_GROUPS.filter(
  (group) => group.domainId === "meta"
).flatMap((group) => group.agents)

const gridAgents: SubAgent[] = matrixGroups.flatMap((group) =>
  ROLE_COLUMNS.map((role) => group.byRole.get(role.id)).filter(
    (agent) => agent !== undefined
  )
)

// The fold takes the meta group, not the grid's leftovers, so the completeness
// test in `agent-placement.test.ts` can fail.
export const PLACED_AGENT_IDS: AgentName[] = [...gridAgents, ...metaAgents].map(
  (agent) => agent.id
)
