import { DOMAIN_ORDER } from "@workspace/matrix";
import type { Domain } from "../../types/index.js";

/**
 * Sort domains into canonical display order: custom domains first (alphabetically),
 * then built-in domains in the shared DOMAIN_ORDER.
 */
export function orderDomains(domains: Domain[]): Domain[] {
  const builtInSet = new Set<Domain>(DOMAIN_ORDER);
  return [
    ...domains.filter((d) => !builtInSet.has(d)).sort(),
    ...DOMAIN_ORDER.filter((d) => domains.includes(d)),
  ];
}
