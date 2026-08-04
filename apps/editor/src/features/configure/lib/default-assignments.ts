// The relevance + default-load rule behind auto-assignment: which sub-agents
// a freshly selected skill reaches, and how each of them loads it. Pure —
// (category id) in, assignments out — so the store can apply it and the tests
// can pin it. The data all comes from the matrix: the category names the
// domain, `required` marks the fundamentals, and the agent roster says which
// role agents a domain actually has.

import {
  CATALOG,
  SUB_AGENT_GROUPS,
  type CatalogCategory,
  type Domain,
} from "@workspace/matrix"

import type { Assignment, LoadState } from "@/stores/persisted-schema"

// The four roles the design's matrix has columns for. Skills auto-assign only
// to these; the ragged rest (researchers, architecture, the meta agents) stay
// reachable through the ••• panel but are never assigned implicitly.
const CORE_ROLES = ["developer", "pm", "reviewer", "tester"] as const

// Domains that build things — everything with agents except meta, which the
// design names as the exception to every cross-domain rule.
const IMPLEMENTATION_DOMAINS = SUB_AGENT_GROUPS.map(
  (group) => group.domainId
).filter((domainId) => domainId !== "meta")

// A shared skill (typescript-config, monorepo tooling…) serves every
// implementation domain; a meta skill serves none implicitly; anything else
// stays home. Mirrors the design prototype's CROSS map, but derived.
const targetDomains = (domainId: Domain): Domain[] => {
  if (domainId === "shared") return IMPLEMENTATION_DOMAINS
  if (domainId === "meta") return []
  return [domainId]
}

const coreAgentIds = (domainId: Domain): string[] => {
  const group = SUB_AGENT_GROUPS.find((g) => g.domainId === domainId)
  if (!group) return []

  const ids = new Set(group.agents.map((agent) => agent.id as string))
  return CORE_ROLES.map((role) => `${domainId}-${role}`).filter((id) =>
    ids.has(id)
  )
}

const isTestingCategory = (category: CatalogCategory) =>
  category.id.endsWith("-testing")

// What a project is built on rather than reaches for: the matrix's `required`
// categories, plus the frameworks themselves.
const isFundamental = (category: CatalogCategory) =>
  category.required || category.id.endsWith("-framework")

const testerOf = (domainId: Domain) => `${domainId}-tester`

// The load defaults from docs/web/editor-spec.md: most skills load lazily,
// fundamentals are preloaded, and a testing skill is preloaded only where it
// is the point — on its own domain's tester.
const defaultLoad = (category: CatalogCategory, agentId: string): LoadState => {
  if (isTestingCategory(category))
    return agentId === testerOf(category.domainId) ? "preloaded" : "lazy"
  if (isFundamental(category)) return "preloaded"

  return "lazy"
}

// Everything a fresh selection starts with. Unknown or absent categories
// (an added skill the marketplace index could not place) assign nowhere.
export const defaultAssignmentsFor = (
  categoryId: string | undefined
): Record<string, Assignment> => {
  const category = categoryId ? CATALOG.categoriesById[categoryId] : undefined
  if (!category) return {}

  const assign = (agentId: string): [string, Assignment] => [
    agentId,
    { load: defaultLoad(category, agentId), enabled: true },
  ]

  return Object.fromEntries(
    targetDomains(category.domainId).flatMap(coreAgentIds).map(assign)
  )
}
