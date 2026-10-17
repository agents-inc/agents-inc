import { DOMAINS, type Domain } from "../vendor/generated/source-types"

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

// Short, to fit nine filter chips on one row.
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

/** Whether the UI has a section for this domain. */
export const isDomain = (domainId: string): domainId is Domain =>
  DOMAIN_IDS.has(domainId)

// Agent ids are `<domain>-<role>`; unprefixed ones (`pm`, `reviewer`, the keepers) land in `meta`.
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
