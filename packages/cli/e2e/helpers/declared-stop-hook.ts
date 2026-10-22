import path from "path";
import { mkdir, writeFile } from "fs/promises";

import { DIRS, FILES } from "../pages/constants.js";
import { renderAgentYaml, sourceFolderIn } from "./test-utils.js";

const DECLARED_STOP_COMMAND = "make check";

const DECLARED_STOP_HOOK = {
  Stop: [{ hooks: [{ type: "command", command: DECLARED_STOP_COMMAND }] }],
};

/** How `agent.liquid` writes {@link DECLARED_STOP_HOOK} into frontmatter. */
export const DECLARED_STOP_HOOK_LINE = `hooks: ${JSON.stringify(DECLARED_STOP_HOOK)}`;

/** A project's own definition of `agentName`, which wins over the built-in one. */
export async function declareAStopHook(dir: string, agentName: string): Promise<void> {
  const agentDir = path.join(sourceFolderIn(dir), DIRS.AGENTS, agentName);
  await mkdir(agentDir, { recursive: true });

  await writeFile(
    path.join(agentDir, FILES.METADATA_YAML),
    `${renderAgentYaml(agentName, undefined, { hooks: DECLARED_STOP_HOOK })}\n`,
  );
  await writeFile(path.join(agentDir, FILES.IDENTITY_MD), `# ${agentName}\n`);
  await writeFile(path.join(agentDir, FILES.PLAYBOOK_MD), "## Workflow\n");
}
