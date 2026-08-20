import { getAgentDefinitions } from "../../agents/index.js";
import { loadMergedAgents } from "../../loading/index.js";
import type { AgentDefinition, AgentName, AgentSourcePaths } from "../../../types/index.js";

export type AgentDefs = {
  /** Merged agent definitions (CLI defaults + source overrides). Source takes precedence. */
  agents: Partial<Record<AgentName, AgentDefinition>>;
  /** The sourcePath used to load agent partials (for compilation). */
  sourcePath: string;
  /** Full agent source paths (agentsDir, sourcePath). */
  agentSourcePaths: AgentSourcePaths;
};

/**
 * Loads agent definitions from the CLI's own installation.
 *
 * Merges CLI built-in agents with source repository agents (source overrides CLI).
 * Returns the merged definitions plus the source path for compilation.
 *
 * It takes no arguments because there is nothing here for a caller to vary: agent partials
 * ship with the CLI, so {@link getAgentDefinitions} is always asked for its local branch.
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
