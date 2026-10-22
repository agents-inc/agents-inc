import path from "path";
import { directoryExists } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { PROJECT_ROOT, DIRS } from "../../consts";
import type { AgentSourcePaths } from "../../types";

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
