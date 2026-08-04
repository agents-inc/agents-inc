import { getAgentDefinitions } from "../../agents/index.js";
import { loadMergedAgents } from "../../loading/index.js";
import type { AgentDefinition, AgentName, AgentSourcePaths } from "../../../types/index.js";

export type AgentDefs = {
  /** Merged agent definitions (CLI defaults + source overrides). Source takes precedence. */
  agents: Record<AgentName, AgentDefinition>;
  /** The sourcePath used to load agent partials (for compilation). */
  sourcePath: string;
  /** Full agent source paths (agentsDir, templatesDir, sourcePath). */
  agentSourcePaths: AgentSourcePaths;
};

/**
 * Loads agent definitions from the CLI and optionally from a remote source.
 *
 * Merges CLI built-in agents with source repository agents (source overrides CLI).
 * Returns the merged definitions plus the source path for compilation.
 */
export async function loadAgentDefs(options?: {
  projectDir?: string;
  forceRefresh?: boolean;
}): Promise<AgentDefs> {
  const agentSourcePaths = await getAgentDefinitions(undefined, options);
  const agents = await loadMergedAgents(agentSourcePaths.sourcePath);

  return {
    agents,
    sourcePath: agentSourcePaths.sourcePath,
    agentSourcePaths,
  };
}
