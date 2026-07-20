import { findStack } from "../../lib/matrix/matrix-provider.js";
import { orderDomains } from "../../lib/wizard/index.js";
import type { Domain } from "../../types/index.js";
import { isDomain } from "../../utils/type-guards.js";

const DOMAIN_DISPLAY_NAMES: Record<Domain, string> = {
  web: "Web",
  api: "API",
  ai: "AI",
  cli: "CLI",
  mobile: "Mobile",
  desktop: "Desktop",
  infra: "Infrastructure",
  meta: "Meta",
  shared: "Shared",
};

/** One-line domain descriptions shown in the domain-selection grid. */
export const BUILT_IN_DOMAIN_DESCRIPTIONS: Record<Domain, string> = {
  web: "Frontend web applications",
  api: "Backend APIs and services",
  ai: "AI and LLM integrations",
  cli: "Command-line tools",
  mobile: "Mobile applications",
  desktop: "Desktop applications",
  infra: "CI/CD, deployment, and infrastructure",
  meta: "Design patterns, code review, and research methodology",
  shared: "Shared utilities and methodology",
};

export function getDomainDisplayName(domain: string): string {
  return (
    (isDomain(domain) ? DOMAIN_DISPLAY_NAMES[domain] : null) ??
    domain.charAt(0).toUpperCase() + domain.slice(1)
  );
}

export function getStackName(stackId: string | null): string | undefined {
  if (!stackId) return undefined;
  return findStack(stackId)?.name;
}

export { orderDomains };
