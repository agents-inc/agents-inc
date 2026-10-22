import { getLocalAgentDefinitions } from "../../agents/index.js";
import { loadMergedAgents } from "../../loading/index.js";
import type { AgentDefinition, AgentName, AgentSourcePaths } from "../../../types/index.js";

export type AgentDefs = {
  /** The CLI's own sub-agent definitions; nothing a marketplace declares. */
  agents: Partial<Record<AgentName, AgentDefinition>>;
  sourcePath: string;
  agentSourcePaths: AgentSourcePaths;
};

/**
 * The single definition of which sub-agents exist, shared by every compile pass and every
 * emitted `AgentName` union; a marketplace's sub-agents are never included.
 */
export async function loadAgentDefs(): Promise<AgentDefs> {
  const agentSourcePaths = await getLocalAgentDefinitions();
  const agents = await loadMergedAgents(agentSourcePaths.sourcePath);

  return {
    agents,
    sourcePath: agentSourcePaths.sourcePath,
    agentSourcePaths,
  };
}
