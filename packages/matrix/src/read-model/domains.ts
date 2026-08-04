import type { Domain } from "../vendor/generated/source-types"

// Canonical display order, mirroring BUILT_IN_DOMAIN_ORDER in the CLI's src/cli/consts.ts.
// Kept in sync by hand — it is nine strings that have not changed in the CLI's history, and
// importing it would mean pulling the CLI's whole consts module across the repo boundary.
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

// From the CLI's BUILT_IN_DOMAIN_DESCRIPTIONS. Used for chip and group tooltips.
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

const DOMAIN_POSITION = new Map(
  DOMAIN_ORDER.map((domain, index) => [domain, index])
)

export const compareDomains = (a: Domain, b: Domain) =>
  (DOMAIN_POSITION.get(a) ?? DOMAIN_ORDER.length) -
  (DOMAIN_POSITION.get(b) ?? DOMAIN_ORDER.length)
