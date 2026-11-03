import type { RecompileAgentsResult } from "../../agents/agent-recompiler.js";

/** A mocked `recompileAgents` result that did nothing. */
export function buildRecompileAgentsResult(
  overrides: Partial<RecompileAgentsResult> = {},
): RecompileAgentsResult {
  return {
    compiled: [],
    rewritten: [],
    created: [],
    failed: [],
    warnings: [],
    ...overrides,
  };
}
