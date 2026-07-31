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

/**
 * Display name of the selected stack, or `undefined` when the wizard is
 * building from scratch — the state each caller renders in its own words
 * ("your custom stack" in the tab dropdown, "none" in the summary panel).
 *
 * The lookup asserts. `selectedStackId` is written by `selectStack` and nothing
 * else: `createInitialState` starts it at `null`, neither hydration path
 * restores it from config, and `selectStack`'s only non-null argument is
 * `focusedStack.id` in `stack-selection.tsx`, taken from
 * `matrix.suggestedStacks` — the same array `findStack` searches. The matrix is
 * never rebuilt while the wizard is mounted (`initializeMatrix` runs during
 * startup loading; the wizard's own add/remove-source path writes config and
 * re-reads a summary). So a miss is a bug, not a stack to label with its raw id
 * — the same conclusion `wizard.tsx` already reaches for the same lookup.
 */
export function getStackName(stackId: string | null): string | undefined {
  if (!stackId) return undefined;
  const stack = findStack(stackId);
  if (!stack) throw new Error(`Stack not found: ${stackId}`);
  return stack.name;
}

export { orderDomains };
