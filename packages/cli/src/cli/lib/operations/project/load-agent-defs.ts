import { getAgentDefinitions } from "../../agents/index.js";
import { loadMergedAgents } from "../../loading/index.js";
import type { AgentDefinition, AgentName, AgentSourcePaths } from "../../../types/index.js";

export type AgentDefs = {
  /**
   * The CLI's own sub-agent definitions — every `metadata.yaml` under its `src/agents/`, and
   * nothing a marketplace declares.
   */
  agents: Partial<Record<AgentName, AgentDefinition>>;
  /** The sourcePath used to load agent partials (for compilation). */
  sourcePath: string;
  /** Full agent source paths (agentsDir, sourcePath). */
  agentSourcePaths: AgentSourcePaths;
};

/**
 * The single definition of which sub-agents exist.
 *
 * Every path that emits the sub-agent unions in a `config-types.ts` derives its roster from here,
 * and so does every compile pass, because the answer has to be the same one: agent partials
 * resolve under {@link getAgentDefinitions}' local branch, and the generated `AGENT_NAMES` is
 * built by `scripts/generate-source-types.ts` from that same `src/agents/` directory. A roster
 * that included a marketplace's own sub-agents would put a literal in `AgentName` that nothing
 * downstream can honour (owner ruling 2026-08-21).
 *
 * It takes no arguments because there is nothing here for a caller to vary: agent partials
 * ship with the CLI, so {@link getAgentDefinitions} is always asked for its local branch.
 *
 * That local branch answers `sourcePath: PROJECT_ROOT`, so {@link loadMergedAgents} below is
 * handed the CLI's own root as its "source" and both of its sides read the same directory. The
 * merge is real and degenerate, which is why this used to be documented as "CLI defaults plus
 * source overrides" — a sentence describing an argument this function has not taken for some
 * time. The wiring was the intent; the sentence was the fossil.
 */
export async function loadAgentDefs(): Promise<AgentDefs> {
  const agentSourcePaths = await getAgentDefinitions();
  const agents = await loadMergedAgents(agentSourcePaths.sourcePath);

  return {
    agents,
    sourcePath: agentSourcePaths.sourcePath,
    agentSourcePaths,
  };
}
