import path from "path";
import { directoryExists } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { PROJECT_ROOT, DIRS } from "../../consts";
import { fetchFromSource, type FetchOptions } from "../loading";
import { loadProjectSourceConfig } from "../configuration";
import type { AgentSourcePaths } from "../../types";

export async function getAgentDefinitions(remoteSource?: string): Promise<AgentSourcePaths> {
  if (remoteSource) {
    return fetchAgentDefinitionsFromRemote(remoteSource);
  }
  return getLocalAgentDefinitions();
}

export async function getLocalAgentDefinitions(): Promise<AgentSourcePaths> {
  const agentsDir = path.join(PROJECT_ROOT, DIRS.agents);

  if (!(await directoryExists(agentsDir))) {
    throw new Error(
      `Agent partials not found at '${agentsDir}'. Ensure the CLI is properly installed.`,
    );
  }

  verbose(`Agent partials loaded from CLI: ${agentsDir}`);

  return {
    agentsDir,
    sourcePath: PROJECT_ROOT,
  };
}

export async function fetchAgentDefinitionsFromRemote(
  source: string,
  options: FetchOptions & { agentsDir?: string } = {},
): Promise<AgentSourcePaths> {
  verbose(`Fetching agent partials from remote: ${source}`);

  const result = await fetchFromSource(source, { subdir: "" });

  // ABORT on an unreadable config. It names the directory the fetched repository keeps its agent
  // partials in; defaulting past it compiles agents from whatever happens to sit at `DIRS.agents`,
  // or reports partials missing from a repository that has them.
  const sourceProjectConfig = options.agentsDir
    ? undefined
    : await loadProjectSourceConfig(result.path);
  if (sourceProjectConfig?.agentsDir) {
    verbose(`Using agentsDir from source config: ${sourceProjectConfig.agentsDir}`);
  }
  const agentsDirRelPath = options.agentsDir ?? sourceProjectConfig?.agentsDir ?? DIRS.agents;

  const agentsDir = path.join(result.path, agentsDirRelPath);

  if (!(await directoryExists(agentsDir))) {
    throw new Error(`Agent partials not found at '${agentsDir}'`);
  }

  verbose(`Agent partials fetched from: ${result.path}`);

  return {
    agentsDir,
    sourcePath: result.path,
  };
}
