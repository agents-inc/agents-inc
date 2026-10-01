import type { RecompileAgentsResult } from "../../agents/agent-recompiler.js";

/**
 * What `recompileAgents` answers, for a spec that mocks it: a pass that compiled nothing, wrote
 * nothing and had nothing to say.
 *
 * Every list is empty by default so a caller states each one its assertion reads. `compiled` and
 * `rewritten` carry different facts — a spec that pins one of them names it here rather than
 * inheriting an echo of the other.
 */
export function buildRecompileAgentsResult(
  overrides: Partial<RecompileAgentsResult> = {},
): RecompileAgentsResult {
  return {
    compiled: [],
    rewritten: [],
    failed: [],
    warnings: [],
    ...overrides,
  };
}
