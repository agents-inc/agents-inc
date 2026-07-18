import { BUILT_IN_DOMAIN_ORDER } from "../../consts.js";
import { findStack } from "../../lib/matrix/matrix-provider.js";
import type { Domain } from "../../types/index.js";
import { isDomain } from "../../utils/type-guards.js";

export function getDomainDisplayName(domain: string): string {
  const displayNames: Record<Domain, string> = {
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
  return (
    (isDomain(domain) ? displayNames[domain] : null) ??
    domain.charAt(0).toUpperCase() + domain.slice(1)
  );
}

export function getStackName(stackId: string | null): string | undefined {
  if (!stackId) return undefined;
  return findStack(stackId)?.name;
}

/** Sort domains into canonical display order: custom domains first (alphabetically), then built-in domains (per BUILT_IN_DOMAIN_ORDER). */
export function orderDomains(domains: Domain[]): Domain[] {
  const builtIn = BUILT_IN_DOMAIN_ORDER.filter((d) => domains.includes(d));
  const custom = domains.filter((d) => !BUILT_IN_DOMAIN_ORDER.includes(d)).sort();
  return [...custom, ...builtIn];
}
