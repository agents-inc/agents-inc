import path from "path";
import { directoryExists } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { PROJECT_ROOT, DIRS, CLAUDE_DIR, STANDARD_DIRS } from "../../consts";
import { fetchFromSource, type FetchOptions } from "../loading";
import { loadProjectSourceConfig } from "../configuration";
import type { AgentSourcePaths } from "../../types";

export type AgentDefinitionOptions = FetchOptions & {
  projectDir?: string;
};

export async function getAgentDefinitions(
  remoteSource?: string,
  options: AgentDefinitionOptions = {},
): Promise<AgentSourcePaths> {
  if (remoteSource) {
    return fetchAgentDefinitionsFromRemote(remoteSource, options);
  }
  return getLocalAgentDefinitions(options);
}

export async function getLocalAgentDefinitions(
  options: AgentDefinitionOptions = {},
): Promise<AgentSourcePaths> {
  const agentsDir = path.join(PROJECT_ROOT, DIRS.agents);

  if (!(await directoryExists(agentsDir))) {
    throw new Error(
      `Agent partials not found at '${agentsDir}'. Ensure the CLI is properly installed.`,
    );
  }

  const localTemplatesDir = options.projectDir
    ? path.join(options.projectDir, CLAUDE_DIR, STANDARD_DIRS.TEMPLATES)
    : undefined;
  const useLocalTemplates =
    localTemplatesDir !== undefined && (await directoryExists(localTemplatesDir));
  if (useLocalTemplates) {
    verbose(`Using local templates from: ${localTemplatesDir}`);
  }
  const templatesDir = useLocalTemplates
    ? localTemplatesDir
    : path.join(PROJECT_ROOT, DIRS.templates);

  if (!(await directoryExists(templatesDir))) {
    verbose(`Templates directory not found: ${templatesDir}`);
  }

  verbose(`Agent partials loaded from CLI: ${agentsDir}`);
  verbose(`Templates directory: ${templatesDir}`);

  return {
    agentsDir,
    templatesDir,
    sourcePath: PROJECT_ROOT,
  };
}

export async function fetchAgentDefinitionsFromRemote(
  source: string,
  options: FetchOptions & { agentsDir?: string } = {},
): Promise<AgentSourcePaths> {
  verbose(`Fetching agent partials from remote: ${source}`);

  const result = await fetchFromSource(source, { subdir: "" });

  const sourceProjectConfig = options.agentsDir
    ? undefined
    : await loadProjectSourceConfig(result.path);
  if (sourceProjectConfig?.agentsDir) {
    verbose(`Using agentsDir from source config: ${sourceProjectConfig.agentsDir}`);
  }
  const agentsDirRelPath = options.agentsDir ?? sourceProjectConfig?.agentsDir ?? DIRS.agents;

  const agentsDir = path.join(result.path, agentsDirRelPath);
  const templatesDir = path.join(agentsDir, path.basename(DIRS.templates));

  if (!(await directoryExists(agentsDir))) {
    throw new Error(`Agent partials not found at '${agentsDir}'`);
  }

  if (!(await directoryExists(templatesDir))) {
    verbose(`Templates directory not found: ${templatesDir}`);
  }

  verbose(`Agent partials fetched from: ${result.path}`);

  return {
    agentsDir,
    templatesDir,
    sourcePath: result.path,
  };
}
