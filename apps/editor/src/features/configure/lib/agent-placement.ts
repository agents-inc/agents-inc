import {
  SUB_AGENT_GROUPS,
  type AgentName,
  type Domain,
  type SubAgent,
  type SubAgentGroup,
} from "@workspace/matrix"

// Where the skill options panel can put each sub-agent: a cell in the domain ×
// role grid, or a row behind the Meta fold. Pure derivation over the roster, so
// it sits here rather than in the component — which is also what
// `react-refresh/only-export-components` requires of anything the panel exports
// that is not a component.

// The design's unified matrix: the same role columns over every implementation
// domain, with Meta held out as the stated exception. Every domain-prefixed
// role the roster fields has a column, which is what makes the panel's reach
// complete — `PLACED_AGENT_IDS` below is where that is asserted.
//
// The reviewer and PM columns died with the per-domain reviewers and PMs
// (CLI-398, CLI-399): a consolidated role agent has no domain row to sit on, so
// both are hand-assignable through the Meta fold like the other prefix-less
// agents. Researcher arrived the other way round — the roster gained one per
// implementation domain (CLI-351) and this list did not follow, so four agents
// were hand-assignable nowhere until EDITOR-10, while still taking skills from
// stacks and from auto-assignment.
//
// `short` follows the design's own abbreviation, from `MX_ROLES` in
// `.claude-design/design/Configurator v5.dc.html`: the role's first three
// letters unless its stem is already a word — `dev`, `pm`, `rev`, `test`.
// `researcher` takes the first rule, as `reviewer` did. Nothing about the
// panel's width decides it: the columns measure 89px in the shipped layout and
// `res` inks 17px of that, the same as `dev`.
//
// `id` IS AN ID SUFFIX, NOT A FLAVOR, and the two coincide for all three
// columns only by luck. `roleOf` below reads it off the agent id, so it must
// match what follows `<domain>-`; `SubAgent.flavor` is a different vocabulary,
// where the pms' is `planning` against ids ending `-pm`. Constraining this list
// to `RoleFlavor` would type-check today and be wrong for the first column
// whose two spellings differ.
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

// Implementation domains that actually have at least one role-column agent.
//
// The filter is a guard against a row of nothing but inert gaps, not a way of
// leaving an agent out — every domain fields all three roles today, so it drops
// nobody. A domain fielding only one of them would still draw its row, one live
// cell beside two gaps, because the alternative is an agent with nowhere to be
// clicked.
export const matrixGroups: MatrixGroup[] = implementationGroups
  .map((group) => ({
    domainId: group.domainId,
    label: group.label,
    byRole: canonicalAgentsByRole(group),
  }))
  .filter(hasAnyRole)

// The exception, folded shut by default behind the design's `＋`. Planning is
// the fold's side of the CLI-398/399 consolidation: one `pm` for every domain
// has no per-domain column to sit in.
export const metaAgents = SUB_AGENT_GROUPS.filter(
  (group) => group.domainId === "meta"
).flatMap((group) => group.agents)

// One per populated cell. A domain × role pair with no agent draws an inert
// gap, which places nobody, so those drop out here.
const gridAgents: SubAgent[] = matrixGroups.flatMap((group) =>
  ROLE_COLUMNS.map((role) => group.byRole.get(role.id)).filter(
    (agent) => agent !== undefined
  )
)

/**
 * Every sub-agent the panel can place, by both routes at once.
 *
 * The two routes are deliberately defined independently — the fold takes the
 * meta GROUP rather than whatever the grid could not place. A leftovers bucket
 * would make the completeness claim true by construction and so unfalsifiable,
 * and would file a domain-prefixed agent under a heading that reads "Meta".
 * Independence is what leaves the claim something to catch, and the assertion
 * in `agent-placement.test.ts` is the only thing that looks.
 */
export const PLACED_AGENT_IDS: AgentName[] = [...gridAgents, ...metaAgents].map(
  (agent) => agent.id
)
