import type { GateReport } from "../../config-gate/index.js";
import type { PropagationResult } from "../../config-gate/propagate.js";
import type { PropagatedRecompileSummary } from "../../operations/project/recompile-project-agents.js";

/** A gate write that changed nothing, propagated nowhere and recompiled nothing. */
export function buildGateReport(
  overrides: {
    propagated?: Partial<PropagationResult>;
    recompile?: Partial<PropagatedRecompileSummary>;
  } = {},
): GateReport {
  return {
    globalWritten: false,
    changes: {
      skills: { added: [], removed: [], sourceChanged: [], otherChanged: [] },
      agents: { added: [], removed: [], changed: [] },
      stackChanged: false,
      selectedDomainsChanged: false,
      scalarsChanged: [],
      projectsChanged: false,
    },
    propagated: {
      updated: [],
      unreadable: [],
      gone: [],
      notOurs: [],
      failed: [],
      ...overrides.propagated,
    },
    recompile: {
      rewrittenCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      warnings: [],
      ...overrides.recompile,
    },
  };
}
