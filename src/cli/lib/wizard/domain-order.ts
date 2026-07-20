import { BUILT_IN_DOMAIN_ORDER } from "../../consts.js";
import type { Domain } from "../../types/index.js";

/**
 * Sort domains into canonical display order: custom domains first (alphabetically),
 * then built-in domains in BUILT_IN_DOMAIN_ORDER.
 */
export function orderDomains(domains: Domain[]): Domain[] {
  const builtInSet = new Set<Domain>(BUILT_IN_DOMAIN_ORDER);
  return [
    ...domains.filter((d) => !builtInSet.has(d)).sort(),
    ...BUILT_IN_DOMAIN_ORDER.filter((d) => domains.includes(d)),
  ];
}
