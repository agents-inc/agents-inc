import {
  agentsLeftOutOfCodexMessage,
  unexpressibleOnCodexMessage,
} from "@workspace/compile/agent-source";

import { codexProjectTrustMessage, trustCodexProject } from "./codex-project-trust.js";
import { agentCodec, agentsDir } from "../installation/install-layout.js";
import { glob } from "../../utils/fs.js";
import type { Provider } from "../../consts.js";

/** Once per run, not per sub-agent or scope: each notice is true of the whole installation. */
export async function codexCompileNotices(
  provider: Provider,
  projectDir: string,
): Promise<string[]> {
  if (provider !== "codex") return [];

  return [
    agentsLeftOutOfCodexMessage(),
    unexpressibleOnCodexMessage(),
    ...(await trustNotice(projectDir)),
  ];
}

/** Only when role files exist: trusting a project with nothing for Codex to read grants nothing. */
async function trustNotice(projectDir: string): Promise<string[]> {
  if (!(await holdsProjectRoles(projectDir))) return [];

  const said = codexProjectTrustMessage(projectDir, await trustCodexProject(projectDir));
  return said === undefined ? [] : [said];
}

async function holdsProjectRoles(projectDir: string): Promise<boolean> {
  const roles = await glob(agentCodec("codex").listGlob, agentsDir("codex", "project", projectDir));

  return roles.length > 0;
}
