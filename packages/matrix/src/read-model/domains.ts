import { DOMAINS, type Domain } from "../vendor/generated/source-types"

// The canonical display order. The CLI's wizard imports it from here — the
// byte-duplicate it used to keep in sync by hand (`BUILT_IN_DOMAIN_ORDER` in
// src/cli/consts.ts) was folded into this one when the selection semantics
// moved onto this shared surface.
export const DOMAIN_ORDER: readonly Domain[] = [
  "web",
  "api",
  "ai",
  "mobile",
  "desktop",
  "cli",
  "infra",
  "meta",
  "shared",
]

// Short labels, for a filter bar that has to fit nine chips on one row.
// The CLI spells `infra` out as "Infrastructure"; the design's chip says "Infra".
export const DOMAIN_LABELS: Record<Domain, string> = {
  web: "Web",
  api: "API",
  ai: "AI",
  mobile: "Mobile",
  desktop: "Desktop",
  cli: "CLI",
  infra: "Infra",
  meta: "Meta",
  shared: "Shared",
}

// One-line descriptions: the editor's chip and group tooltips, and the CLI's
// domain-selection grid — its own copy folded into this one alongside
// DOMAIN_ORDER above.
export const DOMAIN_DESCRIPTIONS: Record<Domain, string> = {
  web: "Frontend web applications",
  api: "Backend APIs and services",
  ai: "AI and LLM integrations",
  mobile: "Mobile applications",
  desktop: "Desktop applications",
  cli: "Command-line tools",
  infra: "CI/CD, deployment, and infrastructure",
  meta: "Design patterns, code review, and research methodology",
  shared: "Shared utilities and methodology",
}

const DOMAIN_IDS = new Set<string>(DOMAINS)

/**
 * Whether the UI has a section for this domain.
 *
 * Exported because a fetched marketplace names its own domains as plain
 * strings, and the nine here are the only ones with a label, an order and a
 * filter chip — so this is the question `buildCatalog` asks before it decides a
 * category has somewhere to render.
 */
export const isDomain = (domainId: string): domainId is Domain =>
  DOMAIN_IDS.has(domainId)

// Agent ids are `<domain>-<role>` for the twelve agents that belong to a domain. The other six
// (`agent-summoner`, `codex-keeper`, `convention-keeper`, `skill-summoner`, and the two
// consolidated role agents `pm` and `reviewer`) have no domain prefix and land in `meta`,
// alongside the meta-domain skills.
//
// The CLI's `MergedSkillsMatrix.agentDefinedDomains` would be the authoritative source, but it
// is never populated and the CLI has it queued for deletion, so the prefix is what we have.
export const agentDomainOf = (agentId: string): Domain => {
  const prefix = agentId.split("-")[0]
  return prefix && isDomain(prefix) ? prefix : "meta"
}

const DOMAIN_POSITION = new Map(
  DOMAIN_ORDER.map((domain, index) => [domain, index])
)

export const compareDomains = (a: Domain, b: Domain) =>
  (DOMAIN_POSITION.get(a) ?? DOMAIN_ORDER.length) -
  (DOMAIN_POSITION.get(b) ?? DOMAIN_ORDER.length)
